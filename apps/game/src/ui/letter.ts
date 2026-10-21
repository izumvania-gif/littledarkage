/**
 * A letter from home as a soldier's triangle (concept «Письма»): the player unfolds it fold by fold,
 * reads it on aged paper, chooses to read it to themselves, aloud or to hide it, may write an answer,
 * and folds it back — only into a triangle. Someone else's letter read aloud is shown open, without choices.
 * The paper is drawn in code (ui/letter/paper.ts); the text itself is DOM over it, so it stays readable.
 */
import './letter/letter.css';
import { addressee, letter, letterText, type Letter } from '../content/letters.ts';
import { SOLDIERS } from '../content/soldiers.ts';
import type { Gender } from '../core/save.ts';
import { h } from './dom.ts';
import { bounds, drawSheet, FOLDED, H, INK, OPEN, paintSheet, W, type FlapName, type FoldState, type SheetArt } from './letter/paper.ts';

export type ReadMode = 'silent' | 'aloud' | 'hidden';

export interface LetterResult {
  read: ReadMode;
  reply: string | null;
}

/** One fold takes six frames at 12 a second: the stepped motion of cut-out animation. */
const FRAME_MS = 1000 / 12;
const FOLD_FRAMES = 6;
const UNFOLD_ORDER: readonly FlapName[] = ['strip', 'left', 'right'];
const ADVANCE = ['Space', 'Enter', 'NumpadEnter'];

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fontsReady(): Promise<void> {
  if (!document.fonts) return;
  await Promise.race([Promise.allSettled([document.fonts.load('21px "Bad Script"', 'Кому Полевая'), document.fonts.load('8px "PT Mono"', 'ПОЛЕВАЯ 48')]), wait(1500)]);
}

/** The modal shared by both kinds of letter: the sheet on the left, a cream plate with words and buttons on the right. */
class LetterView {
  readonly root: HTMLElement;
  readonly side: HTMLElement;
  readonly hint: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly text: HTMLElement;
  private readonly art: SheetArt;
  private readonly l: Letter;
  private readonly reduced: boolean;
  private readonly previous: Element | null;
  state: FoldState;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private readonly onResize = () => this.layout();

  constructor(ui: HTMLElement, l: Letter, body: string, art: SheetArt, state: FoldState, reduced: boolean, label: string) {
    this.l = l;
    this.art = art;
    this.state = { ...state };
    this.reduced = reduced;
    this.previous = document.activeElement;
    this.canvas = h('canvas', { class: 'lt-canvas', attrs: { 'aria-hidden': 'true' } });
    this.text = h('div', { class: `lt-text lt-hand-${l.hand}`, attrs: { lang: 'ru' } });
    for (const para of body.split('\n\n')) this.text.append(h('p', { text: para }));
    this.text.style.color = INK[l.hand];
    this.sheet = h('div', { class: 'lt-sheet' }, this.canvas, this.text);
    this.hint = h('p', { class: 'lt-hint', attrs: { 'aria-live': 'polite' } });
    this.side = h('div', { class: 'lt-side' });
    this.root = h('section', { class: 'lt', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': label } }, h('div', { class: 'lt-body' }, this.sheet, this.side));
    if (reduced) this.root.classList.add('lt-reduced');
    ui.append(this.root);
    window.addEventListener('resize', this.onResize);
    this.layout();
    requestAnimationFrame(() => this.root.classList.add('lt-in'));
  }

  /** Keys while the letter is open: nothing reaches the game behind it. Tab stays inside. */
  listen(handler: (e: KeyboardEvent) => void): void {
    this.keyHandler = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.code === 'Tab') {
        this.trapTab(e);
        return;
      }
      handler(e);
    };
    window.addEventListener('keydown', this.keyHandler, true);
  }

  onSheetClick(fn: () => void): void {
    this.sheet.addEventListener('click', fn);
  }

  private trapTab(e: KeyboardEvent): void {
    const items = [...this.root.querySelectorAll<HTMLElement>('button, textarea')].filter((el) => !el.hidden && !(el as HTMLButtonElement).disabled && el.offsetParent !== null);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === items.length - 1 ? 0 : i + 1;
    e.preventDefault();
    items[next]?.focus();
  }

  /** Canvas size from the window; the camera frames what is visible of the paper now. */
  layout(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sideW = Math.min(360, Math.max(260, vw * 0.28));
    const availW = Math.max(240, vw - sideW - 96);
    const height = Math.min(vh * 0.88, availW * (H / W));
    const width = height * (W / H);
    this.sheet.style.width = `${width}px`;
    this.sheet.style.height = `${height}px`;
    this.side.style.width = `${sideW}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.render();
    this.placeText();
  }

  private camera(): { s: number; x: number; y: number } {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const b = bounds(this.state);
    const m = 16;
    const s = Math.min(cw / (b.w + 2 * m), ch / (b.h + 2 * m));
    return { s, x: (cw - b.w * s) / 2 - b.x * s, y: (ch - b.h * s) / 2 - b.y * s };
  }

  render(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const cam = this.camera();
    ctx.setTransform(cam.s, 0, 0, cam.s, cam.x, cam.y);
    drawSheet(ctx, this.art, this.state);
  }

  /** The DOM text sits over the open sheet, inside its margins; long letters shrink a little, then scroll. */
  private placeText(): void {
    const dpr = this.canvas.width / (parseFloat(this.canvas.style.width) || 1);
    const cam = this.camera();
    const s = cam.s / dpr;
    const left = cam.x / dpr + 38 * s;
    const top = cam.y / dpr + 30 * s;
    this.text.style.left = `${left}px`;
    this.text.style.top = `${top}px`;
    this.text.style.width = `${(W - 38 - 22) * s}px`;
    this.text.style.height = `${(H - 30 - 24) * s}px`;
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    let size = 15.8 * s * (root / 16) * (this.l.hand === 'child' ? 1.06 : 1);
    const min = size * 0.84;
    this.text.style.fontSize = `${size}px`;
    while (this.text.scrollHeight > this.text.clientHeight + 1 && size > min) {
      size -= 0.5;
      this.text.style.fontSize = `${size}px`;
    }
  }

  showText(on: boolean): void {
    this.text.classList.toggle('lt-shown', on);
    if (on) this.placeText();
  }

  /** One flap moving to `to` (0 folded, 1 open) in stepped frames. */
  async move(name: FlapName, to: number): Promise<void> {
    const from = this.state[name];
    const frames = this.reduced ? 1 : FOLD_FRAMES;
    for (let i = 1; i <= frames; i++) {
      this.state = { ...this.state, [name]: from + ((to - from) * i) / frames };
      this.render();
      if (i < frames) await wait(FRAME_MS);
    }
  }

  async close(): Promise<void> {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler, true);
    window.removeEventListener('resize', this.onResize);
    this.root.classList.remove('lt-in');
    if (!this.reduced) await wait(260);
    this.root.remove();
    if (this.previous instanceof HTMLElement && this.previous.isConnected) this.previous.focus();
  }
}

function button(text: string, key: string | null, main = false): HTMLButtonElement {
  return h('button', { class: `lt-btn${main ? ' lt-main' : ''}`, attrs: { type: 'button' } }, key ? h('kbd', { text: key }) : null, key ? ' ' : null, text);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The player's own letter: unfold, read, choose, maybe reply, fold back. */
export async function openLetter(ui: HTMLElement, n: number, opts: { gender: Gender; name: string; reduced: boolean; canReply: boolean; onFold?: () => void }): Promise<LetterResult> {
  const l = letter(n);
  await fontsReady();
  const art = paintSheet(l, addressee(opts.name));
  const v = new LetterView(ui, l, letterText(n, opts.gender), art, FOLDED, opts.reduced, `Письмо ${l.fromLine}`);
  const title = h('h2', { class: 'lt-title', text: 'Тебе письмо' });
  const meta = h('p', { class: 'lt-meta', text: `${cap(l.fromLine)}.` });
  const unfold = button('Развернуть', 'Пробел', true);
  v.side.append(title, meta, v.hint, unfold);
  v.hint.textContent = 'Солдатский треугольник. Разверни его.';
  unfold.focus();

  let busy = false;
  let folds = 0;
  let reply: string | null = null;
  let finish: (r: ReadMode) => void = () => undefined;
  const chosen = new Promise<ReadMode>((r) => (finish = r));

  const advance = async () => {
    if (busy || folds >= UNFOLD_ORDER.length) return;
    busy = true;
    opts.onFold?.();
    await v.move(UNFOLD_ORDER[folds]!, 1);
    folds++;
    busy = false;
    if (folds < UNFOLD_ORDER.length) {
      v.hint.textContent = folds === 1 ? 'Ещё сгиб.' : 'Последний сгиб.';
      return;
    }
    v.showText(true);
    choose();
  };

  // ---------- choosing how to read it, and the answer ----------

  const actions = h('div', { class: 'lt-actions' });
  const silent = button('Прочитать про себя', '1');
  const aloud = button('Прочитать вслух', '2');
  const hide = button('Спрятать', '3');
  const write = button('Написать ответ', '4');
  silent.addEventListener('click', () => finish('silent'));
  aloud.addEventListener('click', () => finish('aloud'));
  hide.addEventListener('click', () => finish('hidden'));
  actions.append(silent, aloud, hide);
  if (opts.canReply) actions.append(write);

  const area = h('textarea', { class: 'lt-area', attrs: { id: 'lt-reply', rows: '9', spellcheck: 'true' } });
  const replyLabel = h('label', { class: 'lt-label', text: 'Ответ домой', attrs: { for: 'lt-reply' } });
  const save = button('Готово', null, true);
  const cancel = button('Отмена', 'Esc');
  const confirmBox = h('div', { class: 'lt-confirm', attrs: { role: 'alert' } });
  const replyBox = h('div', { class: 'lt-reply' }, replyLabel, area, h('div', { class: 'lt-row' }, save, cancel), confirmBox);
  replyBox.hidden = true;
  confirmBox.hidden = true;

  const choose = () => {
    unfold.remove();
    title.textContent = 'Письмо';
    v.hint.textContent = 'Как его прочесть?';
    v.side.append(actions, replyBox);
    actions.hidden = false;
    replyBox.hidden = true;
    write.lastChild!.textContent = reply ? 'Переписать ответ' : 'Написать ответ';
    silent.focus();
  };

  const openReply = () => {
    actions.hidden = true;
    replyBox.hidden = false;
    confirmBox.hidden = true;
    v.hint.textContent = 'Напиши, что хочешь. Письмо уйдёт с почтой.';
    area.value = reply ?? '';
    area.focus();
  };
  write.addEventListener('click', openReply);
  save.addEventListener('click', () => {
    const t = area.value.trim();
    reply = t ? area.value : null;
    choose();
    write.focus();
  });
  const leaveReply = () => {
    const changed = area.value !== (reply ?? '');
    if (!changed || !area.value.trim()) {
      choose();
      write.focus();
      return;
    }
    // Never lose what was written without asking.
    const yes = button('Да, стереть', null);
    const no = button('Нет, писать дальше', null, true);
    confirmBox.replaceChildren(h('p', { text: 'Стереть написанное?' }), h('div', { class: 'lt-row' }, no, yes));
    confirmBox.hidden = false;
    yes.addEventListener('click', () => {
      choose();
      write.focus();
    });
    no.addEventListener('click', () => {
      confirmBox.hidden = true;
      area.focus();
    });
    no.focus();
  };
  cancel.addEventListener('click', leaveReply);

  v.listen((e) => {
    if (!replyBox.hidden) {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (!confirmBox.hidden) {
          confirmBox.hidden = true;
          area.focus();
        } else leaveReply();
      }
      return;
    }
    if (folds < UNFOLD_ORDER.length) {
      if (ADVANCE.includes(e.code) && !e.repeat) {
        e.preventDefault();
        void advance();
      }
      return;
    }
    const digit = /^(Digit|Numpad)([1-4])$/.exec(e.code)?.[2];
    if (digit && !e.repeat) {
      e.preventDefault();
      if (digit === '1') finish('silent');
      else if (digit === '2') finish('aloud');
      else if (digit === '3') finish('hidden');
      else if (opts.canReply) openReply();
    }
  });
  unfold.addEventListener('click', () => void advance());
  v.onSheetClick(() => void advance());

  const read = await chosen;

  // Folding it back: only into a triangle.
  actions.hidden = true;
  replyBox.hidden = true;
  v.showText(false);
  title.textContent = 'Письмо';
  v.hint.textContent = read === 'hidden' ? 'Складываешь и прячешь.' : 'Складываешь треугольником.';
  for (const name of [...UNFOLD_ORDER].reverse()) {
    opts.onFold?.();
    await v.move(name, 0);
    if (!opts.reduced) await wait(FRAME_MS * 2);
  }
  if (!opts.reduced) await wait(450);
  await v.close();
  return { read, reply };
}

/** Someone else's letter shown while they read it aloud: the unfolded sheet only, no choices; resolves on Space/Enter/click. */
export async function showLetter(ui: HTMLElement, n: number, opts: { reduced: boolean; reader?: string }): Promise<void> {
  const l = letter(n);
  await fontsReady();
  const art = paintSheet(l, null);
  const reader = opts.reader ? (SOLDIERS[opts.reader]?.name ?? opts.reader) : null;
  const v = new LetterView(ui, l, l.text, art, OPEN, opts.reduced, `Письмо ${l.fromLine}`);
  const next = button('Дальше', 'Пробел', true);
  v.side.append(h('h2', { class: 'lt-title', text: 'Письмо' }), h('p', { class: 'lt-meta', text: `${cap(l.fromLine)}.${reader ? ` Читает ${reader}.` : ''}` }), next);
  v.showText(true);
  next.focus();
  await new Promise<void>((resolve) => {
    v.listen((e) => {
      if (ADVANCE.includes(e.code) && !e.repeat) {
        e.preventDefault();
        resolve();
      }
    });
    next.addEventListener('click', () => resolve());
    v.onSheetClick(() => resolve());
  });
  await v.close();
}
