/**
 * The blind striker's DOM: coordinators' lines placed on the frame edge in their direction, sound captions,
 * the queue with its bar and «Готово», the key strip, and the plates for the whisper, pause and going out
 * alone. Every line that means something is a flat plate (4.5:1 or better) and grows with «крупный шрифт».
 */
import { CMD_LABEL, type Cmd } from '../../../core/battle.ts';
import type { Hand } from '../../../content/soldiers.ts';
import { REF_W } from '../../../render/palette.ts';
import type { Fit } from '../../../render/stage.ts';
import { hintFor } from '../../../engine/keys.ts';
import { h } from '../../../ui/dom.ts';
import './striker.css';

/** Where the lines gather: the centre of the haze, and the ellipse they sit on. */
const CENTER = { x: REF_W / 2, y: 320 };
const RX = 540;
const RY = 270;

export interface LineOptions {
  name: string;
  hand: Hand;
  /** The partner's lines are never pushed aside by the others. */
  partner?: boolean;
  whisper?: boolean;
  hint?: string;
}

export class StrikerHud {
  readonly root: HTMLElement;
  readonly done: HTMLButtonElement;
  private readonly lines: HTMLElement;
  private readonly captionsBox: HTMLElement;
  private readonly turnPlate: HTMLElement;
  private readonly dock: HTMLElement;
  private readonly barFill: HTMLElement;
  private readonly slots: HTMLElement;
  private readonly keys: HTMLElement;
  private readonly sackKey: HTMLElement;
  private readonly center: HTMLElement;
  private readonly debugBox: HTMLElement;
  private fit: Fit = { scale: 1, x: 0, y: 0 };
  captionsOn = true;
  /** «Подсказки слепого режима»: the partner's lines carry «это твой». */
  blindHints = false;

  constructor(ui: HTMLElement) {
    this.lines = h('div', { class: 'sk-layer', attrs: { 'aria-live': 'polite', 'aria-label': 'Голоса координаторов' } });
    this.captionsBox = h('div', { class: 'sk-captions', attrs: { 'aria-live': 'polite', 'aria-label': 'Подписи звуков' } });
    this.turnPlate = h('p', { class: 'sk-turn' });
    this.barFill = h('i');
    this.slots = h('div', { class: 'sk-slots' });
    this.done = h('button', { class: 'sk-done', text: 'Готово', attrs: { type: 'button' } });
    this.dock = h('div', { class: 'sk-dock' }, h('div', { class: 'sk-bar' }, this.barFill), h('div', { class: 'sk-row' }, this.slots, this.done));
    this.sackKey = h('span', { class: 'sk-sack' }, ' · ', h('kbd', { text: hintFor('KeyG') }), ' мешок');
    this.sackKey.hidden = true;
    this.keys = h(
      'p',
      { class: 'sk-keys' },
      // The keys as the player has them (settings → «Клавиши»).
      ...keyList([
        [['KeyW'], 'шаг, дважды — два'],
        [['KeyS'], 'назад'],
        [['KeyA', 'KeyD'], 'вбок'],
        [['KeyQ', 'KeyE'], 'поворот'],
        [['KeyX'], 'кругом'],
        [['KeyZ'], 'стой'],
        [['Space'], 'прыжок'],
        [['KeyF'], 'нюхать'],
      ]),
      this.sackKey,
      ...keyList([
        [['Backspace'], 'стереть'],
        [['Enter'], 'готово'],
        [['KeyC'], 'подписи'],
        [['KeyP'], 'пауза'],
      ], true),
    );
    this.center = h('div', { class: 'sk-center', attrs: { role: 'status' } });
    this.center.hidden = true;
    this.debugBox = h('pre', { class: 'sk-debug' });
    this.debugBox.hidden = true;
    this.root = h('div', { class: 'sk-root' }, this.lines, this.turnPlate, this.captionsBox, this.dock, this.keys, this.center, this.debugBox);
    ui.append(this.root);
  }

  layout(fit: Fit): void {
    this.fit = fit;
    this.root.style.setProperty('--u', `${fit.scale}px`);
    this.place(this.turnPlate, 24, 22);
    this.place(this.captionsBox, 24, 64);
    this.place(this.dock, REF_W / 2, 600, 0.5, 0);
    this.place(this.keys, REF_W / 2, 686, 0.5, 0);
    this.place(this.center, REF_W / 2, 300, 0.5, 0.5);
    this.place(this.debugBox, REF_W - 24, 196, 1, 0);
    for (const el of this.lines.querySelectorAll<HTMLElement>('.sk-line')) this.placeLine(el);
  }

  private place(el: HTMLElement, x: number, y: number, ax = 0, ay = 0): void {
    el.style.left = `${this.fit.x + x * this.fit.scale}px`;
    el.style.top = `${this.fit.y + y * this.fit.scale}px`;
    el.style.transform = ax || ay ? `translate(${-ax * 100}%, ${-ay * 100}%)` : '';
  }

  private placeLine(el: HTMLElement): void {
    this.place(el, Number(el.dataset.x), Number(el.dataset.y), Number(el.dataset.ax), Number(el.dataset.ay));
  }

  /** ?debug: what the partner meant and said. Empty hides the plate. */
  debug(text: string): void {
    this.debugBox.textContent = text;
    this.debugBox.hidden = !text;
  }

  setTurn(text: string): void {
    this.turnPlate.textContent = text;
  }

  showDock(on: boolean): void {
    this.dock.hidden = !on;
    this.keys.hidden = !on;
  }

  setSack(on: boolean): void {
    this.sackKey.hidden = !on;
  }

  /** The queue: one slot per action this turn; `now` marks the step being carried out. */
  setQueue(queue: readonly Cmd[], slots: number, now: number, open: boolean): void {
    this.slots.replaceChildren();
    for (let i = 0; i < Math.max(slots, queue.length); i++) {
      const cmd = queue[i];
      const cls = ['sk-slot', cmd ? '' : 'empty', i === now ? 'now' : ''].filter(Boolean).join(' ');
      this.slots.append(h('span', { class: cls, text: cmd ? CMD_LABEL[cmd] : '·' }));
    }
    this.done.disabled = !open;
  }

  /** 0..1 of the decision time left; null hides the countdown («без таймера»). */
  setBar(left: number | null): void {
    this.barFill.parentElement!.classList.toggle('off', left === null);
    this.barFill.style.transform = `scaleX(${left ?? 0})`;
  }

  /**
   * A line at the frame edge, in the speaker's direction from the player (x to the right, z ahead).
   * A speaker's new line replaces his last one.
   */
  line(id: string, text: string, dir: { x: number; z: number }, opts: LineOptions): HTMLElement {
    for (const old of this.lines.querySelectorAll<HTMLElement>(`.sk-line[data-who="${id}"]`)) old.remove();
    const el = h(
      'div',
      { class: `sk-line hand-${opts.hand}${opts.partner ? ' partner' : ''}${opts.whisper ? ' whisper' : ''}`, attrs: { 'data-who': id } },
      h('span', { class: 'who' }, opts.name, opts.partner && this.blindHints ? h('b', { class: 'mine', text: 'это твой' }) : null),
      h('span', { class: 'text', text }),
      opts.hint ? h('span', { class: 'hint', text: opts.hint }) : null,
    );
    const len = Math.hypot(dir.x, dir.z) || 1;
    const ux = dir.x / len;
    const uy = -dir.z / len;
    const x = CENTER.x + ux * RX;
    const y = Math.min(585, Math.max(90, CENTER.y + uy * RY));
    Object.assign(el.dataset, { x: String(x), y: String(y), ax: String(0.5 + 0.5 * ux), ay: String(0.5 + 0.5 * uy) });
    this.lines.append(el);
    this.placeLine(el);
    // Lines from nearby directions would cover each other: the partner's stays, the others make way.
    if (opts.partner) for (const other of this.others(el)) if (!other.classList.contains('partner')) this.settle(other);
    if (!opts.partner) this.settle(el);
    return el;
  }

  private others(el: HTMLElement): HTMLElement[] {
    return [...this.lines.querySelectorAll<HTMLElement>('.sk-line:not(.fade)')].filter((o) => o !== el);
  }

  /** Moves a line off the ones it covers: sideways first, toward the centre only at the frame edge. */
  private settle(el: HTMLElement): void {
    const ay = Number(el.dataset.ay);
    let x = Number(el.dataset.x);
    let y = Number(el.dataset.y);
    const lo = this.fit.x + 8 * this.fit.scale;
    const hi = this.fit.x + (REF_W - 8) * this.fit.scale;
    for (let tries = 0; tries < 8; tries++) {
      const mine = el.getBoundingClientRect();
      const box = this.others(el)
        .map((o) => o.getBoundingClientRect())
        .find((o) => mine.left < o.right && o.left < mine.right && mine.top < o.bottom && o.top < mine.bottom);
      if (!box) break;
      const dx = mine.left + mine.width / 2 >= box.left + box.width / 2 ? box.right - mine.left + 8 : -(mine.right - box.left + 8);
      if (mine.left + dx >= lo && mine.right + dx <= hi) x += dx / this.fit.scale;
      else y += (ay >= 0.5 ? -(mine.bottom - box.top + 8) : box.bottom - mine.top + 8) / this.fit.scale;
      el.dataset.x = String(x);
      el.dataset.y = String(y);
      this.placeLine(el);
    }
  }

  fadeLines(): void {
    for (const el of this.lines.querySelectorAll<HTMLElement>('.sk-line')) {
      el.classList.add('fade');
      setTimeout(() => el.remove(), 500);
    }
  }

  caption(text: string): void {
    if (!this.captionsOn) return;
    const el = h('p', { class: 'sk-cap', text });
    this.captionsBox.append(el);
    while (this.captionsBox.children.length > 5) this.captionsBox.firstElementChild?.remove();
    setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => el.remove(), 400);
    }, 3600);
  }

  setCaptions(on: boolean): void {
    this.captionsOn = on;
    this.captionsBox.hidden = !on;
  }

  toggleCaptions(): boolean {
    this.setCaptions(!this.captionsOn);
    return this.captionsOn;
  }

  /** A plate in the middle (going out alone, pause); null hides it. `action` adds one button (the pause's «Настройки»). */
  say(text: string | null, sub?: string, action?: { label: string; run: () => void }): void {
    this.center.hidden = text === null;
    if (text === null) return;
    const button = action ? h('button', { class: 'sk-action', text: action.label, attrs: { type: 'button' } }) : null;
    button?.addEventListener('click', () => action?.run());
    this.center.replaceChildren(h('p', { class: 'title', text }), sub ? h('p', { class: 'sub', text: sub }) : '', button ?? '');
  }

  destroy(): void {
    this.root.remove();
  }
}

function keyList(items: [string[], string][], lead = false): (Node | string)[] {
  const out: (Node | string)[] = [];
  items.forEach(([keys, label], i) => {
    if (i || lead) out.push(' · ');
    keys.forEach((k, j) => {
      if (j) out.push(' ');
      out.push(h('kbd', { text: hintFor(k) }));
    });
    out.push(` ${label}`);
  });
  return out;
}
