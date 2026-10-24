/**
 * Agent mode (`?agent`): the game in words, for an AI agent (or any program) to play, as in Eferon.
 *
 * observe() says what the player perceives: where we are, the line on the caption plate and its choices, every
 * window on screen (the intro, a letter, the register, the box of letters, the finale), what a canvas stage
 * tells in words (the battle as seen in the lamp's last flash or as smelled in the dark, a duty, the brawl), what
 * happened since the last look, and the list of actions. act(id, arg) does one of them and lets the game run
 * until it waits for the player again. Time only moves when the agent acts: the page runs on a virtual clock.
 *
 * Actions come from three places: the caption plate (continue, say:<n>), the stage (agent/hooks.ts) and every
 * button and field on screen (ui:/type:/choose:, go:<place> in the barracks), so DOM windows need nothing special.
 */
import { pressKey, stageAgents, type AgentAction } from './hooks.ts';
import type { VirtualTime } from './virtualTime.ts';

export interface Observation {
  /** Everything below as one text for a language model to read. */
  text: string;
  where: string;
  run: { name: string; scene: string; hp: number; cycle: number } | null;
  /** The caption plate: who speaks, what, and the choices if it asks. */
  plate: { header: string; speaker: string; text: string; choices: string[] } | null;
  screen: string[];
  events: string[];
  actions: AgentAction[];
}

/** Game time per frame while the bridge lets time pass (20 frames a game second). */
const STEP = 50;
/** Prompts that wait for Space: the caption plate's, the finale's, the brawl's chronicle. */
const CONTINUE = '.cap-hint, .fn-hint, .mt-next, [data-agent-continue]';
const CONTROLS = 'button, input, textarea, select';

const visible = (el: Element): boolean => el instanceof HTMLElement && !el.closest('[hidden]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'x';
/** A button's words without its key caps («Сказать» rather than «Сказать Enter»). */
const bare = (el: HTMLElement): string => {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('kbd, .key').forEach((k) => k.remove());
  return (copy.textContent ?? '').trim() || el.innerText;
};
const clean = (s: string): string => s.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();

export class AgentBridge {
  private readonly time: VirtualTime;
  private readonly ui: HTMLElement;
  private events: string[] = [];
  private controls = new Map<string, { el: HTMLElement; label: string }>();
  private readonly heard = new WeakMap<Element, string>();
  private readonly told = new WeakSet<Element>();
  /** Draws the picture once (main.ts: the canvas is not redrawn every frame in agent mode). */
  draw: () => void = () => undefined;

  constructor(time: VirtualTime, ui: HTMLElement) {
    this.time = time;
    this.ui = ui;
    // Whatever the game says in passing (live regions: the plate, captions, hints) is kept for the next look.
    const watch = new MutationObserver((records) => {
      const changed = new Set<Element>();
      for (const r of records) {
        const el = r.target instanceof Element ? r.target : r.target.parentElement;
        const live = el?.closest('[aria-live], [role="alert"], [role="status"]');
        if (live) changed.add(live);
      }
      for (const el of changed) {
        const text = clean((el as HTMLElement).innerText ?? el.textContent ?? '');
        const before = this.heard.get(el);
        if (!text || before === text) continue;
        this.heard.set(el, text);
        // A region that keeps its last lines as elements (captions, voices) is told by its new lines only.
        const kids = [...el.children].filter((k): k is HTMLElement => k instanceof HTMLElement);
        const fresh = kids.length
          ? kids
              .filter((k) => !this.told.has(k) && this.told.add(k))
              .map((k) => clean(k.innerText).replace(/\s*\n\s*/g, ': '))
              .filter(Boolean)
              .join(' / ')
          : text;
        if (fresh && this.events[this.events.length - 1] !== fresh) this.events.push(fresh.length > 400 ? `${fresh.slice(0, 400)}…` : fresh);
        if (this.events.length > 60) this.events.splice(0, this.events.length - 60);
      }
    });
    watch.observe(document.body, { subtree: true, childList: true, characterData: true });
  }

  /** Lets the game run until it waits for the player again (or `max` seconds of game time pass). */
  async settle(min = 0.3, max = 120): Promise<void> {
    let t = 0;
    let n = 0;
    for (;;) {
      this.time.advance(STEP);
      t += STEP / 1000;
      for (const a of stageAgents()) a.poll?.();
      // Promises, fetches and the music worker move on real time: give them a moment every few frames.
      if (++n % 3 === 0) await this.time.yieldReal();
      if (t < min) continue;
      if (t >= max) break;
      if (stageAgents().some((a) => a.busy?.())) continue;
      if (this.waiting()) break;
      // Nothing to do and nothing moving on its own: the page may be waiting on something real (a chunk, a
      // font, the GPU starting), so let real time pass too.
      await this.time.yieldReal(4);
    }
    // A last breath, so a promise resolved on the final frame has drawn its result.
    await this.time.yieldReal();
  }

  /** Lets `seconds` of game time pass, frame by frame. */
  private async pass(seconds: number): Promise<void> {
    for (let t = 0, n = 0; t < seconds * 1000; t += STEP) {
      this.time.advance(STEP);
      for (const a of stageAgents()) a.poll?.();
      if (++n % 3 === 0) await this.time.yieldReal();
    }
  }

  /** Something on screen waits for the player. */
  private waiting(): boolean {
    if (this.continueShown() || this.choices().length) return true;
    if (stageAgents().some((a) => a.waiting?.())) return true;
    const covers = this.covers();
    for (const el of this.ui.querySelectorAll<HTMLElement>(CONTROLS)) {
      if ((el as HTMLButtonElement).disabled || el.closest('.debug, [inert], [aria-busy="true"]') || (covers && el.closest(covers))) continue;
      if (visible(el)) return true;
    }
    return false;
  }

  private covers(): string {
    return stageAgents()
      .map((a) => a.covers)
      .filter(Boolean)
      .join(', ');
  }

  private continueShown(): boolean {
    return [...this.ui.querySelectorAll(CONTINUE)].some(visible);
  }

  private choices(): HTMLButtonElement[] {
    return [...this.ui.querySelectorAll<HTMLButtonElement>('.choices button')].filter(visible);
  }

  /** The run as the save has it (the scene's own copy may be a step ahead). */
  private run(): Observation['run'] {
    try {
      const run = JSON.parse(localStorage.getItem('lda.save') ?? 'null')?.run;
      if (!run) return null;
      const scene = String(run.scene);
      return { name: `${run.gender === 'f' ? 'рядовая' : 'рядовой'} ${run.name}`, scene, hp: Number(run.hp), cycle: scene.startsWith('c3') || scene === 'finale' ? 3 : scene.startsWith('c2') ? 2 : 1 };
    } catch {
      return null;
    }
  }

  private plate(): Observation['plate'] {
    const plates = [...this.ui.querySelectorAll<HTMLElement>('.caption')].filter(visible);
    const p = plates[plates.length - 1];
    if (!p) return null;
    const header = clean(p.querySelector('.cap-head')?.textContent ?? '');
    const body = p.querySelector<HTMLElement>('.cap-body');
    const speaker = clean(body?.querySelector('.speaker')?.textContent ?? '');
    const choices = this.choices().map((b) => clean(b.innerText).replace(/^\d+\s*/, ''));
    let text = '';
    if (body && !choices.length) {
      // Read as laid out (a form on the plate — the name, how to sign the triangle — with its labels), the
      // speaker's name taken off the front.
      text = clean(body.innerText);
      if (speaker && text.startsWith(speaker)) text = clean(text.slice(speaker.length));
    }
    if (!header && !speaker && !text && !choices.length) return null;
    return { header, speaker, text, choices };
  }

  /** Every window on screen besides the plate, as text. */
  private screens(): string[] {
    const out: string[] = [];
    // A stage that describes itself (agent/hooks.ts) is not read off the screen again.
    const covers = this.covers();
    for (const el of this.ui.children) {
      if (!(el instanceof HTMLElement) || !visible(el) || el.matches('.caption, .debug, .bk') || (covers && el.matches(covers))) continue;
      const text = clean(el.innerText);
      if (text) out.push(text.length > 2500 ? `${text.slice(0, 2500)}…` : text);
    }
    return out;
  }

  private where(plate: Observation['plate']): string {
    const names = stageAgents().map((a) => a.name);
    if (names.length) return names.join(' · ');
    if (this.ui.querySelector('.intro') && visible(this.ui.querySelector('.intro')!)) return 'Вступление';
    if (this.ui.querySelector('.bk-bar') && visible(this.ui.querySelector('.bk-bar')!)) return `Казарма${plate?.header ? `: ${plate.header}` : ''}`;
    if (plate?.header) return plate.header;
    // A window without the plate (a letter, the box of letters, the finale) by its heading.
    const heading = [...this.ui.querySelectorAll<HTMLElement>('h1, h2, [aria-label]')].find((el) => visible(el) && !el.closest('.caption, .debug') && (el.matches('h1, h2') || el.matches('[role="dialog"], section')));
    return clean(heading?.matches('h1, h2') ? heading.innerText : (heading?.getAttribute('aria-label') ?? '')) || 'Игра';
  }

  observe(): Observation {
    this.draw();
    const plate = this.plate();
    const run = this.run();
    const where = this.where(plate);
    const lines: string[] = [`[${where}]${run ? ` ${run.name} · хиты ${run.hp}/3 · цикл ${run.cycle} · сцена ${run.scene}` : ''}`];
    for (const a of stageAgents()) lines.push(...a.describe());
    if (plate) {
      lines.push('');
      if (plate.header) lines.push(`Кадр: ${plate.header}`);
      if (plate.text) lines.push(`${plate.speaker ? `${plate.speaker}: ` : ''}${plate.text}`);
      plate.choices.forEach((c, i) => lines.push(`  ${i + 1}) ${c}`));
    }
    const screen = this.screens();
    if (screen.length) lines.push('', ...screen);
    const events = this.events.splice(0);
    if (events.length) lines.push('', 'С прошлого взгляда:', ...events.map((e) => `- ${e.replace(/\n+/g, ' / ')}`));
    const actions = this.actions();
    lines.push('', 'Действия:', ...actions.map((a) => `- ${a.id}${a.arg ? ` <${a.arg}>` : ''}: ${a.label}`));
    return { text: lines.join('\n'), where, run, plate, screen, events, actions };
  }

  actions(): AgentAction[] {
    const out: AgentAction[] = [];
    if (this.continueShown() && !this.choices().length) out.push({ id: 'continue', label: 'Дальше (Пробел)' });
    this.choices().forEach((b, i) => out.push({ id: `say:${i + 1}`, label: clean(b.innerText).replace(/^\d+\s*/, '') }));
    for (const a of stageAgents()) out.push(...a.actions());
    // Buttons and fields on screen, named by what they say.
    this.controls.clear();
    const covers = this.covers();
    const seen = new Map<string, number>();
    for (const el of this.ui.querySelectorAll<HTMLElement>(CONTROLS)) {
      if (!visible(el) || (el as HTMLButtonElement).disabled || el.closest('.choices, .debug, [inert], [aria-busy="true"]') || (covers && el.closest(covers))) continue;
      const input = el instanceof HTMLInputElement ? el : null;
      const labelOf = (e: HTMLElement) => e.getAttribute('aria-label') || (e as HTMLInputElement).labels?.[0]?.innerText || (e as HTMLInputElement).placeholder || bare(e) || e.title || e.id || e.tagName;
      const label = clean(labelOf(el)).replace(/\s+/g, ' ');
      if (el.matches('.bk-go')) {
        const id = `go:${el.dataset.spot ?? slug(label)}`;
        this.controls.set(id, { el, label });
        out.push({ id, label });
        continue;
      }
      const verb = el instanceof HTMLSelectElement ? 'choose' : el instanceof HTMLButtonElement || input?.type === 'radio' || input?.type === 'checkbox' || input?.type === 'submit' ? 'ui' : 'type';
      let key = slug(label);
      const n = (seen.get(`${verb}${key}`) ?? 0) + 1;
      seen.set(`${verb}${key}`, n);
      if (n > 1) key += `-${n}`;
      const id = `${verb}:${key}`;
      this.controls.set(id, { el, label });
      if (el instanceof HTMLSelectElement) out.push({ id, label: `${label}${el.value ? ` (сейчас: ${el.selectedOptions[0]?.text})` : ''}`, arg: `одно из: ${[...el.options].map((o) => o.text).join(' | ')}` });
      else if (verb === 'type') out.push({ id, label: `${label}${(el as HTMLInputElement).value ? ` (сейчас: «${(el as HTMLInputElement).value}»)` : ''}`, arg: 'текст' });
      else out.push({ id, label: input && (input.type === 'radio' || input.type === 'checkbox') ? `${label}${input.checked ? ' (выбрано)' : ''}` : label });
    }
    out.push({ id: 'key', label: 'Нажать клавишу, как игрок', arg: 'KeyboardEvent.code: Space, Enter, KeyW, Digit1…' });
    out.push({ id: 'wait', label: 'Подождать, ничего не делая', arg: 'секунды (по умолчанию 3)' });
    return out;
  }

  async act(id: string, arg?: string): Promise<Observation & { result: string }> {
    const result = await this.perform(id.trim(), arg?.trim() || undefined);
    await this.settle();
    return { ...this.observe(), result };
  }

  private async perform(id: string, arg?: string): Promise<string> {
    if (!this.controls.size) this.actions();
    const found = this.controls.get(id) ?? (id.startsWith('go:') ? this.controls.get(`go:${slug(id.slice(3))}`) : undefined);
    if (found) {
      const control = found.el;
      if (control instanceof HTMLSelectElement) {
        const want = (arg ?? '').toLowerCase();
        const opt = [...control.options].find((o) => o.text.toLowerCase() === want || o.value.toLowerCase() === want) ?? [...control.options].find((o) => want && o.text.toLowerCase().includes(want));
        if (!opt) return `Нет такого варианта. Есть: ${[...control.options].map((o) => o.text).join(' | ')}`;
        control.value = opt.value;
        control.dispatchEvent(new Event('input', { bubbles: true }));
        control.dispatchEvent(new Event('change', { bubbles: true }));
        return `Выбрано: ${opt.text}.`;
      }
      if ((control instanceof HTMLInputElement && control.type !== 'radio' && control.type !== 'checkbox' && control.type !== 'submit') || control instanceof HTMLTextAreaElement) {
        control.focus();
        control.value = arg ?? '';
        control.dispatchEvent(new Event('input', { bubbles: true }));
        control.dispatchEvent(new Event('change', { bubbles: true }));
        return 'Написано.';
      }
      control.click();
      return `Нажато: ${found.label}.`;
    }
    const [verb, rest] = id.split(/:(.*)/s) as [string, string | undefined];
    if (verb === 'continue') {
      pressKey('Space');
      return 'Дальше.';
    }
    if (verb === 'say') {
      const b = this.choices()[Number(rest) - 1];
      if (!b) return 'Нет такого ответа.';
      b.click();
      return `Ответ: ${clean(b.innerText).replace(/^\d+\s*/, '')}.`;
    }
    if (verb === 'key') {
      if (!arg && !rest) return 'Какую клавишу? Например: key Space.';
      pressKey(arg ?? rest!);
      return `Нажата клавиша ${arg ?? rest}.`;
    }
    if (verb === 'wait') {
      const s = Math.max(0.1, Math.min(120, Number(arg ?? rest) || 3));
      await this.pass(s);
      return `Прошло ${s} с.`;
    }
    for (const a of [...stageAgents()].reverse()) {
      const done = await a.perform(id, arg);
      if (done != null) return done;
    }
    return `Нет такого действия «${id}». Выберите из списка.`;
  }
}
