/**
 * The coordinator's DOM over the tunnel: the command pad on the right (with a tab for each striker when the
 * player speaks for two, battle 3), the coordinators' lines in the zone, the strikers' name tags,
 * «Принять удар», the teaching plates of the workshop, notes after a turn, the pause plate and the debug text. Laid out in reference pixels inside a box the size of the 1280×720 frame
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
const COUNT_ACC = ['ни одной команды', 'одну команду', 'две команды', 'три команды', 'четыре команды'];

export interface PanelHandlers {
  cmd(c: Cmd): void;
  erase(): void;
  done(): void;
  accept(take: boolean): void;
  /** The player picked whom the next commands are for (battle 3). */
  target(id: string): void;
}

export interface PanelNames {
  /** The partner in the nominative, dative and accusative: Норкин, Норкину, Норкина. */
  nom: string;
  dat: string;
  acc: string;
}

/** A striker the player speaks for. */
export interface PanelStriker extends PanelNames {
  id: string;
}

/** A command in the queue and whom it is for. */
export interface Order {
  to: string;
  cmd: Cmd;
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
  private readonly tags = new Map<string, HTMLElement>();
  private readonly tabs = new Map<string, HTMLButtonElement>();
  private readonly hintEl: HTMLElement;
  private readonly noteEl: HTMLElement;
  private readonly pauseEl: HTMLElement;
  private readonly promptText: HTMLElement;
  readonly debug: HTMLElement;
  private readonly strikers: readonly PanelStriker[];
  private names: PanelStriker;
  private readonly untimed: boolean;
  private noteTimer = 0;
  private phase: Phase = 'idle';
  private slots = 0;

  constructor(ui: HTMLElement, strikers: readonly PanelStriker[], untimed: boolean, on: PanelHandlers) {
    const names = strikers[0]!;
    this.strikers = strikers;
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
    this.queueEl = h('ol', { class: 'cs-queue', attrs: { 'aria-label': strikers.length > 1 ? 'Команды' : `Команды ${names.dat}` } });
    // Two strikers: whom the next command is for («Крыпоткин, шаг вперёд»), by tab, Tab or the digit keys.
    const tabRow = strikers.length > 1 ? h('div', { class: 'cs-tabs', attrs: { role: 'group', 'aria-label': 'Кому' } }) : null;
    strikers.forEach((st, i) => {
      if (!tabRow) return;
      const b = keep(h('button', { attrs: { type: 'button', 'aria-pressed': String(i === 0) } }, h('kbd', { text: String(i + 1) }), h('span', { text: st.dat })));
      b.addEventListener('click', () => on.target(st.id));
      this.tabs.set(st.id, b);
      tabRow.append(b);
    });
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
    const panel = h('section', { class: 'cs-panel', attrs: { 'aria-label': 'Координатор' } }, this.turnEl, this.phaseEl, this.subEl, this.barEl, this.queueEl, tabRow, pad, h('div', { class: 'cs-row' }, this.eraseBtn, this.doneBtn));

    this.promptFill = h('i');
    const acceptBtn = keep(h('button', { class: 'cs-take', attrs: { type: 'button' } }, 'Принять удар ', h('kbd', { text: 'Пробел' })));
    acceptBtn.addEventListener('click', () => on.accept(true));
    this.declineBtn = keep(h('button', { class: 'cs-let', attrs: { type: 'button' } }, 'Не принимать ', h('kbd', { text: 'Enter' })));
    this.declineBtn.addEventListener('click', () => on.accept(false));
    this.declineBtn.hidden = !untimed;
    const promptBar = h('div', { class: 'cs-bar' }, this.promptFill);
    promptBar.hidden = untimed;
    this.promptText = h('p', { text: `${names.acc} бьют!` });
    this.promptEl = h('div', { class: 'cs-accept', attrs: { role: 'alert' } }, this.promptText, h('div', { class: 'cs-row' }, acceptBtn, this.declineBtn), promptBar);
    this.promptEl.hidden = true;

    for (const st of strikers) {
      const tag = h('p', { class: 'cs-tag', text: st.nom, attrs: { 'aria-hidden': 'true' } });
      // Shown once the first flash has placed it.
      tag.hidden = true;
      this.tags.set(st.id, tag);
    }
    this.hintEl = h('p', { class: 'cs-hint', attrs: { 'aria-live': 'polite' } });
    this.hintEl.hidden = true;
    this.noteEl = h('p', { class: 'cs-note', attrs: { 'aria-live': 'polite' } });
    this.noteEl.hidden = true;
    this.pauseEl = h('p', { class: 'cs-pause' }, 'Пауза. ', h('kbd', { text: 'P' }), ' — дальше');
    this.pauseEl.hidden = true;
    this.debug = h('pre', { class: 'cs-debug' });
    this.debug.hidden = true;
    this.box = h('div', { class: 'cs' }, panel, this.promptEl, ...this.tags.values(), this.hintEl, this.noteEl, this.pauseEl, this.debug);
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
    this.phase = p;
    this.slots = slots;
    const n = this.names;
    const two = this.speakingForTwo();
    this.box.dataset.two = two ? '1' : '';
    const text: Record<Phase, [string, string]> = {
      idle: ['', ''],
      plan: ['Смотри на поле', this.untimed ? 'Лампа мигает раз в две секунды. Время не идёт. Любая команда или Enter — говорить.' : 'Лампа мигает раз в две секунды. Любая команда или Enter — говорить.'],
      orders: two
        ? [`Команды ${n.dat}`, `${cap(COUNT_ACC[Math.min(slots, 4)]!)} на двоих, каждому от его лица. Tab — кому.`]
        : [`Команды ${n.dat}`, `${COUNT[Math.min(slots, 4)]}, от его лица. Enter — готово.`],
      exec: [two ? 'Исполняют' : `${n.nom} исполняет`, 'Каждый шаг — вспышка.'],
      prompt: [`${n.acc} бьют`, ''],
    };
    const [title, sub] = text[p];
    this.phaseEl.textContent = title;
    this.subEl.textContent = sub;
    const live = p === 'plan' || p === 'orders';
    for (const b of this.buttons) b.disabled = !live;
    for (const b of this.tabs.values()) b.disabled = !live || b.dataset.gone === '1';
    this.eraseBtn.disabled = p !== 'orders';
    this.doneBtn.disabled = !live;
    this.barEl.style.visibility = live && !this.untimed ? 'visible' : 'hidden';
    this.box.dataset.phase = p;
  }

  setBar(frac: number): void {
    this.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
  }

  setQueue(q: readonly Order[], slots: number): void {
    const two = this.strikers.length > 1;
    this.queueEl.replaceChildren(
      ...Array.from({ length: Math.max(slots, q.length) }, (_, i) => {
        const o = q[i];
        const who = o && two ? `${this.strikers.find((st) => st.id === o.to)?.nom ?? ''}: ` : '';
        return h('li', { class: o ? 'filled' : '', text: o ? `${i + 1}. ${who}${CMD_LABEL[o.cmd]}` : `${i + 1}. —` });
      }),
    );
    this.doneBtn.classList.toggle('ready', slots > 0 && q.length >= slots);
  }

  /** Whom the next commands are for: the tab, and the titles that name him. */
  setTarget(id: string): void {
    const st = this.strikers.find((it) => it.id === id);
    if (!st) return;
    this.names = st;
    for (const [tid, b] of this.tabs) b.setAttribute('aria-pressed', String(tid === id));
    this.setPhase(this.phase, this.slots);
  }

  /** A fallen striker's tab is shut. */
  setGone(id: string): void {
    const b = this.tabs.get(id);
    if (!b) return;
    b.dataset.gone = '1';
    b.disabled = true;
    this.setPhase(this.phase, this.slots);
  }

  /** More than one striker is still listening to the player. */
  private speakingForTwo(): boolean {
    return [...this.tabs.values()].filter((b) => b.dataset.gone !== '1').length > 1;
  }

  /** «Принять удар» for this striker (or hidden). */
  prompt(on: boolean, acc?: string): void {
    if (acc) this.promptText.textContent = `${acc} бьют!`;
    this.promptEl.hidden = !on;
  }

  setPromptBar(frac: number): void {
    this.promptFill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
  }

  /** A striker's name under his last known position (it moves only with the flashes). */
  moveTag(id: string, x: number, y: number, visible: boolean): void {
    const tag = this.tags.get(id);
    if (!tag) return;
    tag.hidden = !visible;
    tag.style.left = `calc(${x} * var(--u))`;
    tag.style.top = `calc(${y} * var(--u))`;
  }

  tagOpacity(a: number): void {
    for (const tag of this.tags.values()) tag.style.opacity = String(a);
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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
