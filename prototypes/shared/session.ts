/**
 * The start card a fresh player sees, the end card with «Ещё раз», and the observer's numbers for the
 * keep/kill call. Runs are kept in this browser (localStorage `lda.proto.runs`) and listed on /proto/.
 */
import { h } from './dom.ts';
import type { Output } from './sound.ts';

export interface RunRecord {
  proto: string;
  /** Which run in this tab: 2+ means the player pressed «Ещё раз». */
  attempt: number;
  at: string;
  seconds: number;
  outcome: string;
  stats: [string, string | number][];
}

const RUNS_KEY = 'lda.proto.runs';
const OUTPUT_KEY = 'lda.proto.output';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function loadRuns(): RunRecord[] {
  return safe(() => JSON.parse(localStorage.getItem(RUNS_KEY) ?? '[]') as RunRecord[], []);
}

export function clearRuns(): void {
  safe(() => localStorage.removeItem(RUNS_KEY), undefined);
}

export function runsText(runs: readonly RunRecord[]): string {
  return runs
    .map((r) => [`${r.proto} · попытка ${r.attempt} · ${r.at.slice(0, 16).replace('T', ' ')} · ${Math.round(r.seconds)} с · ${r.outcome}`, ...r.stats.map(([k, v]) => `  ${k}: ${v}`)].join('\n'))
    .join('\n\n');
}

export class Session {
  readonly proto: string;
  readonly attempt: number;
  private readonly t0 = performance.now();

  constructor(proto: string) {
    this.proto = proto;
    const key = `lda.proto.attempt.${proto}`;
    this.attempt = safe(() => Number(sessionStorage.getItem(key) ?? '0'), 0) + 1;
    safe(() => sessionStorage.setItem(key, String(this.attempt)), undefined);
  }

  get seconds(): number {
    return (performance.now() - this.t0) / 1000;
  }

  /** Saves the run for the observer. */
  finish(outcome: string, stats: [string, string | number][]): RunRecord {
    const rec: RunRecord = { proto: this.proto, attempt: this.attempt, at: new Date().toISOString(), seconds: this.seconds, outcome, stats };
    const runs = loadRuns();
    runs.push(rec);
    safe(() => localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(-200))), undefined);
    return rec;
  }
}

export interface StartCard {
  title: string;
  lead: string;
  rules?: string[];
  keys: [string, string][];
  /** Default output when the player has not chosen before. */
  output?: Output;
  button?: string;
}

/** The card before a run. Resolves on the button, with the chosen sound output (the click unlocks audio). */
export function showStart(ui: HTMLElement, card: StartCard): Promise<Output> {
  const saved = safe(() => localStorage.getItem(OUTPUT_KEY) as Output | null, null);
  const current: Output = saved ?? card.output ?? 'headphones';
  const options: [Output, string][] = [
    ['headphones', 'Наушники'],
    ['speakers', 'Колонки'],
    ['mute', 'Без звука'],
  ];
  const seg = h(
    'fieldset',
    { class: 'seg' },
    h('legend', { text: 'Звук' }),
    ...options.map(([value, label]) => {
      const input = h('input', { attrs: { type: 'radio', name: 'output', value } });
      input.checked = value === current;
      return h('label', { class: 'seg-option' }, input, h('span', { text: label }));
    }),
  );
  const go = h('button', { class: 'primary', text: card.button ?? 'Начать', attrs: { type: 'button' } });
  const keys = h('dl', { class: 'keys' });
  for (const [k, label] of card.keys) keys.append(h('dt', {}, ...kbdLine(k)), h('dd', { text: label }));
  const col = h(
    'div',
    { class: 'card-col' },
    h('h1', { text: card.title }),
    h('p', { class: 'lead', text: card.lead }),
    card.rules?.length ? h('ul', { class: 'rules' }, ...card.rules.map((r) => h('li', { text: r }))) : null,
    keys,
    seg,
    go,
  );
  const root = h('section', { class: 'card', attrs: { 'aria-label': card.title } }, col);
  ui.append(root);
  go.focus();
  return new Promise((resolve) => {
    go.addEventListener('click', () => {
      const out = (seg.querySelector('input:checked') as HTMLInputElement | null)?.value as Output | undefined;
      const output = out ?? current;
      safe(() => localStorage.setItem(OUTPUT_KEY, output), undefined);
      root.remove();
      resolve(output);
    });
  });
}

/** "W A S D" → <kbd>W</kbd> <kbd>A</kbd>…; words in lower case stay plain text. */
function kbdLine(spec: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  for (const part of spec.split(' ')) {
    if (out.length) out.push(' ');
    out.push(/^[a-zа-яё]/.test(part) ? part : h('kbd', { text: part }));
  }
  return out;
}

export interface EndCard {
  title: string;
  text: string;
  stats: [string, string | number][];
  /** Shown as «Ещё раз»; the default action (Enter). */
  onAgain: () => void;
}

/** The card after a run: «Ещё раз» first (the keep signal is pressing it unasked), then the observer's numbers. */
export function showEnd(ui: HTMLElement, card: EndCard, rec: RunRecord): void {
  const again = h('button', { class: 'primary', text: 'Ещё раз', attrs: { type: 'button' } });
  const copy = h('button', { class: 'secondary', text: 'Скопировать итоги', attrs: { type: 'button' } });
  const obs = h('dl', { class: 'obs', attrs: { 'aria-label': 'Для наблюдателя' } });
  for (const [k, v] of [['попытка', rec.attempt] as [string, string | number], ['время', `${Math.round(rec.seconds)} с`] as [string, string], ...card.stats]) {
    obs.append(h('dt', { text: k }), h('dd', { text: String(v) }));
  }
  const root = h(
    'section',
    { class: 'card', attrs: { 'aria-label': card.title } },
    h('div', { class: 'card-col' }, h('h1', { text: card.title }), h('p', { class: 'lead', text: card.text }), h('div', { class: 'row' }, again, copy), h('h2', { class: 'muted', text: 'Для наблюдателя' }), obs, h('p', { class: 'muted' }, h('a', { text: 'Все прототипы и итоги', attrs: { href: '/proto/', style: 'color: inherit' } }))),
  );
  ui.append(root);
  again.focus();
  again.addEventListener('click', () => {
    root.remove();
    card.onAgain();
  });
  copy.addEventListener('click', () => {
    const text = runsText(loadRuns().filter((r) => r.proto === rec.proto));
    void navigator.clipboard?.writeText(text).then(
      () => (copy.textContent = 'Скопировано'),
      () => (copy.textContent = 'Не вышло'),
    );
  });
}
