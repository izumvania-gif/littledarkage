/** DOM over the tunnel: the command panel on the right, speech and barks, Норкин's tag, «Принять удар», debug. */
import { h } from '../shared/dom.ts';
import { place, type Frame } from '../shared/frame.ts';
import { CMD_LABEL, type Cmd } from '../shared/sim.ts';

export type Phase = 'idle' | 'plan' | 'cmd' | 'exec' | 'prompt';

/** Command keys, by physical key. The pad shows them in this order, three to a row. */
export const PAD: [string, string, Cmd][] = [
  ['KeyQ', 'Q', 'turnL'],
  ['KeyW', 'W', 'step'],
  ['KeyE', 'E', 'turnR'],
  ['KeyA', 'A', 'left'],
  ['KeyS', 'S', 'back'],
  ['KeyD', 'D', 'right'],
  ['KeyZ', 'Z', 'about'],
  ['KeyX', 'X', 'step2'],
  ['KeyC', 'C', 'stay'],
  ['Space', 'Пробел', 'jump'],
];

const PHASE_TEXT: Record<Phase, [string, string]> = {
  idle: ['', ''],
  plan: ['Смотри на поле', 'Лампа мигает раз в две секунды. Enter или любая команда — говорить.'],
  cmd: ['Команды Норкину', 'Три команды, от его лица. Enter — готово.'],
  exec: ['Норкин исполняет', 'Каждый шаг — вспышка.'],
  prompt: ['Норкина бьют', ''],
};

export interface PanelHandlers {
  cmd(c: Cmd): void;
  erase(): void;
  done(): void;
  accept(): void;
}

export class Panel {
  private readonly frame: Frame;
  private readonly root: HTMLElement;
  private readonly turnEl: HTMLElement;
  private readonly phaseEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private readonly barEl: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly queueEl: HTMLOListElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly eraseBtn: HTMLButtonElement;
  private readonly doneBtn: HTMLButtonElement;
  private readonly promptEl: HTMLElement;
  private readonly promptFill: HTMLElement;
  readonly tag: HTMLElement;
  readonly debug: HTMLElement;
  private tagAt = { x: 0, y: 0 };

  constructor(frame: Frame, on: PanelHandlers) {
    this.frame = frame;
    const keep = (b: HTMLButtonElement) => {
      // Clicks never move focus here, so Space and Enter always mean the game's keys.
      b.tabIndex = -1;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      return b;
    };
    this.turnEl = h('p', { class: 'c-turn' });
    this.phaseEl = h('p', { class: 'c-phase' });
    this.subEl = h('p', { class: 'c-sub' });
    this.fill = h('i');
    this.barEl = h('div', { class: 'bar c-bar' }, this.fill);
    this.queueEl = h('ol', { class: 'c-queue', attrs: { 'aria-label': 'Команды Норкину' } });
    const pad = h('div', { class: 'c-pad' });
    for (const [, key, cmd] of PAD) {
      const b = keep(h('button', { attrs: { type: 'button' } }, h('kbd', { text: key }), h('span', { text: CMD_LABEL[cmd] })));
      if (cmd === 'jump') b.classList.add('wide');
      b.addEventListener('click', () => on.cmd(cmd));
      this.buttons.push(b);
      pad.append(b);
    }
    this.eraseBtn = keep(h('button', { class: 'c-erase', attrs: { type: 'button' } }, h('kbd', { text: 'Backspace' }), ' стереть'));
    this.doneBtn = keep(h('button', { class: 'c-done', attrs: { type: 'button' } }, h('kbd', { text: 'Enter' }), ' Готово'));
    this.eraseBtn.addEventListener('click', () => on.erase());
    this.doneBtn.addEventListener('click', () => on.done());
    this.root = h('section', { class: 'c-panel', attrs: { 'aria-label': 'Координатор' } }, this.turnEl, this.phaseEl, this.subEl, this.barEl, this.queueEl, pad, h('div', { class: 'c-row' }, this.eraseBtn, this.doneBtn));
    this.promptFill = h('i');
    const acceptBtn = keep(h('button', { attrs: { type: 'button' } }, 'Принять удар ', h('kbd', { text: 'Пробел' })));
    acceptBtn.addEventListener('click', () => on.accept());
    this.promptEl = h('div', { class: 'c-accept', attrs: { role: 'alert', hidden: '' } }, h('p', { text: 'Норкина бьют!' }), acceptBtn, h('div', { class: 'bar' }, this.promptFill));
    this.tag = h('p', { class: 'c-tag', text: 'Норкин', attrs: { 'aria-hidden': 'true' } });
    this.debug = h('pre', { class: 'c-debug', attrs: { hidden: '' } });
    frame.ui.append(this.root, this.tag, this.promptEl, this.debug);
    frame.onResize(() => this.layout());
    this.layout();
  }

  layout(): void {
    const a = this.frame.toScreen(912, 36);
    const z = this.frame.toScreen(1252, 690);
    Object.assign(this.root.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${z.x - a.x}px`, maxHeight: `${z.y - a.y}px` });
    place(this.frame, this.promptEl, 560, 650, 0.5, 0.5);
    place(this.frame, this.tag, this.tagAt.x, this.tagAt.y, 0.5, 0);
  }

  show(on: boolean): void {
    this.root.hidden = !on;
    this.tag.hidden = !on;
  }

  setTurn(turn: number, total: number): void {
    this.turnEl.textContent = `Ход ${turn} из ${total}`;
  }

  setPhase(p: Phase): void {
    const [title, sub] = PHASE_TEXT[p];
    this.phaseEl.textContent = title;
    this.subEl.textContent = sub;
    const live = p === 'plan' || p === 'cmd';
    for (const b of this.buttons) b.disabled = !live;
    this.eraseBtn.disabled = p !== 'cmd';
    this.doneBtn.disabled = !live;
    this.barEl.style.visibility = live ? 'visible' : 'hidden';
    this.root.dataset.phase = p;
  }

  setBar(frac: number): void {
    this.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
  }

  setQueue(q: readonly Cmd[], slots: number): void {
    this.queueEl.replaceChildren(
      ...Array.from({ length: slots }, (_, i) => {
        const c = q[i];
        return h('li', { class: c ? 'filled' : '', text: c ? `${i + 1}. ${CMD_LABEL[c]}` : `${i + 1}. —` });
      }),
    );
  }

  prompt(on: boolean): void {
    this.promptEl.hidden = !on;
  }

  setPromptBar(frac: number): void {
    this.promptFill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
  }

  /** Норкин's name under his last known position (it moves only with the flashes). */
  moveTag(x: number, y: number): void {
    this.tagAt = { x, y };
    place(this.frame, this.tag, x, y, 0.5, 0);
  }
}

/** A short shout over a figure that fades by itself («Ай!», «Принимаю!»). */
export function bark(frame: Frame, x: number, y: number, text: string): void {
  const el = h('p', { class: 'c-bark', text, attrs: { 'aria-hidden': 'true' } });
  const p = frame.toScreen(x, y);
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  frame.ui.append(el);
  setTimeout(() => el.remove(), 1700);
}

/** A coordinator's line in the zone, over their head, until the next plan. Kept clear of the panel on the right. */
export function speech(frame: Frame, x: number, y: number, who: string, text: string): HTMLElement {
  const el = h('p', { class: 'c-speech' }, h('b', { text: who }), text);
  frame.ui.append(el);
  if (x > 640) place(frame, el, Math.min(x + 90, 896), y, 1, 1);
  else place(frame, el, x, y, 0.5, 1);
  return el;
}
