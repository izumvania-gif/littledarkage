/**
 * The coordinator's DOM over the tunnel: the command pad on the right, the coordinators' lines in the zone,
 * the partner's name tag, «Принять удар», the teaching plates of the workshop, notes after a turn, the pause
 * plate and the debug text. Laid out in reference pixels inside a box the size of the 1280×720 frame
 * (--u is one reference pixel), so it moves and scales with the picture and grows with «крупный шрифт».
 */
import './coordinator.css';
import { CMD_LABEL, type Cmd } from '../../../core/battle.ts';
import type { Hand } from '../../../content/soldiers.ts';
import type { Fit } from '../../../render/stage.ts';
import { REF_H, REF_W } from '../../../render/palette.ts';
import { h } from '../../../ui/dom.ts';

export type Phase = 'idle' | 'plan' | 'orders' | 'exec' | 'prompt';

/** Command keys by physical key (KeyboardEvent.code); the pad shows them in this order, three to a row. */
export const PAD: readonly [string, string, Cmd][] = [
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

const COUNT = ['Ни одной команды', 'Одна команда', 'Две команды', 'Три команды', 'Четыре команды'];

export interface PanelHandlers {
  cmd(c: Cmd): void;
  erase(): void;
  done(): void;
  accept(take: boolean): void;
}

export interface PanelNames {
  /** The partner in the nominative, dative and accusative: Норкин, Норкину, Норкина. */
  nom: string;
  dat: string;
  acc: string;
}

export class CoordinatorPanel {
  readonly root: HTMLElement;
  private readonly box: HTMLElement;
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
  private readonly declineBtn: HTMLButtonElement;
  private readonly tag: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly noteEl: HTMLElement;
  private readonly pauseEl: HTMLElement;
  readonly debug: HTMLElement;
  private readonly names: PanelNames;
  private readonly untimed: boolean;
  private noteTimer = 0;

  constructor(ui: HTMLElement, names: PanelNames, untimed: boolean, on: PanelHandlers) {
    this.names = names;
    this.untimed = untimed;
    const keep = (b: HTMLButtonElement) => {
      // A click never takes the focus, so Space and Enter keep meaning the game's keys.
      b.tabIndex = -1;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      return b;
    };
    this.turnEl = h('p', { class: 'cs-turn' });
    this.phaseEl = h('p', { class: 'cs-phase' });
    this.subEl = h('p', { class: 'cs-sub' });
    this.fill = h('i');
    this.barEl = h('div', { class: 'cs-bar' }, this.fill);
    this.queueEl = h('ol', { class: 'cs-queue', attrs: { 'aria-label': `Команды ${names.dat}` } });
    const pad = h('div', { class: 'cs-pad' });
    for (const [, key, cmd] of PAD) {
      const b = keep(h('button', { attrs: { type: 'button' } }, h('kbd', { text: key }), h('span', { text: CMD_LABEL[cmd] })));
      if (cmd === 'jump') b.classList.add('wide');
      b.addEventListener('click', () => on.cmd(cmd));
      this.buttons.push(b);
      pad.append(b);
    }
    this.eraseBtn = keep(h('button', { class: 'cs-erase', attrs: { type: 'button' } }, h('kbd', { text: 'Backspace' }), ' стереть'));
    this.doneBtn = keep(h('button', { class: 'cs-done', attrs: { type: 'button' } }, h('kbd', { text: 'Enter' }), ' Готово'));
    this.eraseBtn.addEventListener('click', () => on.erase());
    this.doneBtn.addEventListener('click', () => on.done());
    const panel = h('section', { class: 'cs-panel', attrs: { 'aria-label': 'Координатор' } }, this.turnEl, this.phaseEl, this.subEl, this.barEl, this.queueEl, pad, h('div', { class: 'cs-row' }, this.eraseBtn, this.doneBtn));

    this.promptFill = h('i');
    const acceptBtn = keep(h('button', { class: 'cs-take', attrs: { type: 'button' } }, 'Принять удар ', h('kbd', { text: 'Пробел' })));
    acceptBtn.addEventListener('click', () => on.accept(true));
    this.declineBtn = keep(h('button', { class: 'cs-let', attrs: { type: 'button' } }, 'Не принимать ', h('kbd', { text: 'Enter' })));
    this.declineBtn.addEventListener('click', () => on.accept(false));
    this.declineBtn.hidden = !untimed;
    const promptBar = h('div', { class: 'cs-bar' }, this.promptFill);
    promptBar.hidden = untimed;
    this.promptEl = h('div', { class: 'cs-accept', attrs: { role: 'alert' } }, h('p', { text: `${names.acc} бьют!` }), h('div', { class: 'cs-row' }, acceptBtn, this.declineBtn), promptBar);
    this.promptEl.hidden = true;

    this.tag = h('p', { class: 'cs-tag', text: names.nom, attrs: { 'aria-hidden': 'true' } });
    // Shown once the first flash has placed it.
    this.tag.hidden = true;
    this.hintEl = h('p', { class: 'cs-hint', attrs: { 'aria-live': 'polite' } });
    this.hintEl.hidden = true;
    this.noteEl = h('p', { class: 'cs-note', attrs: { 'aria-live': 'polite' } });
    this.noteEl.hidden = true;
    this.pauseEl = h('p', { class: 'cs-pause' }, 'Пауза. ', h('kbd', { text: 'P' }), ' — дальше');
    this.pauseEl.hidden = true;
    this.debug = h('pre', { class: 'cs-debug' });
    this.debug.hidden = true;
    this.box = h('div', { class: 'cs' }, panel, this.promptEl, this.tag, this.hintEl, this.noteEl, this.pauseEl, this.debug);
    this.root = this.box;
    ui.append(this.box);
  }

  /** Lays the box over the 1280×720 frame. */
  layout(fit: Fit): void {
    const s = this.box.style;
    s.setProperty('--u', `${fit.scale}px`);
    s.left = `${fit.x}px`;
    s.top = `${fit.y}px`;
    s.width = `${REF_W * fit.scale}px`;
    s.height = `${REF_H * fit.scale}px`;
  }

  setTurn(turn: number, total: number): void {
    this.turnEl.textContent = `Ход ${turn} из ${total}`;
  }

  setPhase(p: Phase, slots: number): void {
    const n = this.names;
    const text: Record<Phase, [string, string]> = {
      idle: ['', ''],
      plan: ['Смотри на поле', this.untimed ? 'Лампа мигает раз в две секунды. Время не идёт. Любая команда или Enter — говорить.' : 'Лампа мигает раз в две секунды. Любая команда или Enter — говорить.'],
      orders: [`Команды ${n.dat}`, `${COUNT[Math.min(slots, 4)]}, от его лица. Enter — готово.`],
      exec: [`${n.nom} исполняет`, 'Каждый шаг — вспышка.'],
      prompt: [`${n.acc} бьют`, ''],
    };
    const [title, sub] = text[p];
    this.phaseEl.textContent = title;
    this.subEl.textContent = sub;
    const live = p === 'plan' || p === 'orders';
    for (const b of this.buttons) b.disabled = !live;
    this.eraseBtn.disabled = p !== 'orders';
    this.doneBtn.disabled = !live;
    this.barEl.style.visibility = live && !this.untimed ? 'visible' : 'hidden';
    this.box.dataset.phase = p;
  }

  setBar(frac: number): void {
    this.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
  }

  setQueue(q: readonly Cmd[], slots: number): void {
    this.queueEl.replaceChildren(
      ...Array.from({ length: Math.max(slots, q.length) }, (_, i) => {
        const c = q[i];
        return h('li', { class: c ? 'filled' : '', text: c ? `${i + 1}. ${CMD_LABEL[c]}` : `${i + 1}. —` });
      }),
    );
    this.doneBtn.classList.toggle('ready', slots > 0 && q.length >= slots);
  }

  prompt(on: boolean): void {
    this.promptEl.hidden = !on;
  }

  setPromptBar(frac: number): void {
    this.promptFill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
  }

  /** The partner's name under his last known position (it moves only with the flashes). */
  moveTag(x: number, y: number, visible: boolean): void {
    this.tag.hidden = !visible;
    this.tag.style.left = `calc(${x} * var(--u))`;
    this.tag.style.top = `calc(${y} * var(--u))`;
  }

  tagOpacity(a: number): void {
    this.tag.style.opacity = String(a);
  }

  /** A teaching plate of the workshop, or nothing. */
  hint(text: string | null): void {
    this.hintEl.hidden = !text;
    this.hintEl.textContent = text ?? '';
  }

  /** One line after a turn («Норкин расслышал Корочкину»), gone after a while. */
  note(text: string, ms = 5000): void {
    this.noteEl.textContent = text;
    this.noteEl.hidden = false;
    window.clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => (this.noteEl.hidden = true), ms);
  }

  paused(on: boolean): void {
    this.pauseEl.hidden = !on;
  }

  /** A coordinator's line in the zone, over their head, until the next plan. */
  speech(x: number, y: number, who: string, text: string, hand: Hand): HTMLElement {
    const el = h('p', { class: `cs-speech hand-${hand}` }, h('b', { text: who }), h('span', { text }));
    el.style.left = `calc(${x} * var(--u))`;
    el.style.top = `calc(${y} * var(--u))`;
    this.box.append(el);
    return el;
  }

  /** A short shout over a figure that fades by itself («Ай!», «Принимаю!»). */
  bark(x: number, y: number, text: string): void {
    const el = h('p', { class: 'cs-bark', text, attrs: { 'aria-hidden': 'true' } });
    el.style.left = `calc(${x} * var(--u))`;
    el.style.top = `calc(${y} * var(--u))`;
    this.box.append(el);
    window.setTimeout(() => el.remove(), 1700);
  }

  destroy(): void {
    window.clearTimeout(this.noteTimer);
    this.box.remove();
  }
}
