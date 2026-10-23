/**
 * The box of undelivered letters (concept §7 «Письма без адресата»): a crate by the mailbox full of soldier's
 * triangles that never reached anyone. The player picks one, unfolds it and reads it (the same aged paper as
 * the letters from home, ui/letter/paper.ts), folds it back. Beside the crate are the player's own replies
 * home: each can go into the box by an explicit press, after a plain warning that other players may read it,
 * without the name, once someone has checked it, and that it can't be taken back. The game never says
 * whether a letter will be read. Other players' words are only ever set as text.
 */
import './deadLetters.css';
import { DEAD_LETTERS, mixLetters, type DeadLetter } from '../content/deadLetters.ts';
import type { Letter } from '../content/letters.ts';
import type { BoxLetter } from '../net/api.ts';
import { h } from './dom.ts';
import { bounds, drawSheet, FOLDED, H, INK, OPEN, paintSheet, W, type FlapName, type FoldState, type SheetArt } from './letter/paper.ts';

export interface MyReply {
  /** The letter from home it answers. */
  n: number;
  /** «Кому» on its triangle. */
  to: string;
  text: string;
  /** Already in the box (from an earlier visit). */
  sent: boolean;
}

export interface DeadLettersOptions {
  reduced: boolean;
  /** Approved letters from other barracks (null when offline: then only the authored ones). */
  others: BoxLetter[] | null;
  /** The player's replies home this run; each can be put in the box only by an explicit press. */
  mine: MyReply[];
  /** Puts one reply in the box (the runner calls postBoxLetter). */
  send(reply: MyReply): Promise<'ok' | 'wait' | 'invalid' | null>;
}

/** A triangle in the crate: an authored letter or one from another barracks, in the shape the reader needs. */
interface Triangle {
  key: string;
  to: string;
  from: string;
  text: string;
  stamp: string | null;
  /** Painted on demand, for the paper's seed, hand, ruling and post number. */
  sheet: Letter;
}

const FRAME_MS = 1000 / 12;
const FOLD_FRAMES = 5;
const UNFOLD_ORDER: readonly FlapName[] = ['strip', 'left', 'right'];
const EXCERPT = 150;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** What each answer of the post office says on the player's reply. */
const SENT_WORDS: Record<'ok' | 'wait' | 'invalid' | 'offline', string> = {
  ok: 'Опущено.',
  wait: 'Ящик полон, попробуйте позже.',
  invalid: 'Ящик такое не берёт: без ссылок, номеров и ругани.',
  offline: 'Почта не ходит. Попробуйте в другой раз.',
};

function fromAuthored(l: DeadLetter, i: number): Triangle {
  return {
    key: `a-${l.id}`,
    to: l.to,
    from: l.from,
    text: l.text,
    stamp: l.stamp ?? null,
    sheet: { n: 600 + i * 7, from: l.from, fromLine: l.from, to: null, cycle: null, hand: l.hand, paper: l.paper, post: l.post, text: l.text },
  };
}

function fromOther(l: BoxLetter): Triangle {
  const post = String(4700 + (Math.abs(l.id) % 290));
  const from = 'из другой казармы';
  return {
    key: `o-${l.id}`,
    to: l.to,
    from,
    text: l.text,
    stamp: null,
    sheet: { n: 2000 + Math.abs(l.id), from, fromLine: from, to: null, cycle: null, hand: l.id % 3 === 0 ? 'pencil' : 'pen', paper: l.id % 2 ? 'lined' : 'plain', post, text: l.text },
  };
}

/** Resolves when the player closes the box (Esc / the close button), with the numbers of replies put in. */
export function openDeadLetters(ui: HTMLElement, opts: DeadLettersOptions): Promise<{ sent: number[] }> {
  return new Promise((resolve) => {
    const box = new Box(ui, opts, (sent) => resolve({ sent }));
    box.focusFirst();
  });
}

class Box {
  private readonly opts: DeadLettersOptions;
  private readonly root: HTMLElement;
  private readonly crate: HTMLElement;
  private readonly triangles: HTMLButtonElement[] = [];
  private readonly previous: Element | null;
  private readonly sent: number[] = [];
  private reader: Reader | null = null;
  private closing = false;
  private readonly done: (sent: number[]) => void;

  constructor(ui: HTMLElement, opts: DeadLettersOptions, done: (sent: number[]) => void) {
    this.opts = opts;
    this.done = done;
    this.previous = document.activeElement;
    const authored = DEAD_LETTERS.map(fromAuthored);
    const others = (opts.others ?? []).filter((l) => typeof l.text === 'string' && l.text.trim()).map(fromOther);
    // One order per visit: the crate isn't reshuffled while it is open.
    const items = mixLetters(authored, others, Math.floor(Math.random() * 1e9));

    this.crate = h('ul', { class: 'dl-crate', attrs: { 'aria-label': 'Письма в ящике' } });
    items.forEach((t, i) => this.crate.append(this.triangle(t, i)));

    const close = h('button', { class: 'dl-btn dl-close', attrs: { type: 'button' } }, 'Закрыть ', h('kbd', { text: 'Esc' }));
    close.addEventListener('click', () => void this.close());

    this.root = h(
      'section',
      { class: `dl${opts.reduced ? ' dl-reduced' : ''}`, attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dl-title' } },
      h(
        'div',
        { class: 'dl-wrap' },
        h(
          'div',
          { class: 'dl-main' },
          h(
            'header',
            { class: 'dl-plate dl-head' },
            h('div', { class: 'dl-head-row' }, h('h2', { class: 'dl-title', text: 'Недошедшие письма', attrs: { id: 'dl-title' } }), close),
            h('p', { class: 'dl-lead', text: 'Ящик у почтового. Сюда складывают письма, которые никому не отдали: адресат выбыл, адреса нет, или их так и не отправили.' }),
            h('p', { class: 'dl-hint', text: 'Стрелки или Tab — выбрать, Enter — развернуть.' }),
          ),
          this.crate,
        ),
        this.mine(),
      ),
    );
    ui.append(this.root);
    window.addEventListener('keydown', this.onKey, true);
    requestAnimationFrame(() => this.root.classList.add('dl-in'));
  }

  focusFirst(): void {
    this.triangles[0]?.focus();
  }

  // ---------- the crate ----------

  private triangle(t: Triangle, i: number): HTMLElement {
    // A pile, not a grid: each triangle lies a little askew, by its place in the crate.
    const tilt = ((i * 37) % 11) - 5;
    const label = `Кому: ${t.to}. ${t.from[0]!.toUpperCase()}${t.from.slice(1)}.${t.stamp ? ` На штампе: «${t.stamp}».` : ''}`;
    const button = h(
      'button',
      { class: 'dl-tri', attrs: { type: 'button', 'aria-label': label, style: `--tilt:${tilt * 0.8}deg` } },
      h('span', { class: 'dl-tri-paper', attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'dl-tri-to', text: `Кому: ${t.to}` }),
      t.stamp ? h('span', { class: 'dl-stamp', text: t.stamp }) : null,
    );
    button.addEventListener('click', () => void this.read(t, button));
    this.triangles.push(button);
    return h('li', {}, button);
  }

  /** Arrow keys walk the pile in reading order, by rows as they lie on the screen. */
  private step(from: HTMLElement, key: string): void {
    const i = this.triangles.indexOf(from as HTMLButtonElement);
    if (i < 0) return;
    let next = i;
    if (key === 'ArrowRight') next = Math.min(this.triangles.length - 1, i + 1);
    else if (key === 'ArrowLeft') next = Math.max(0, i - 1);
    else {
      // Up and down: the nearest triangle in the next row that way.
      const here = from.getBoundingClientRect();
      const down = key === 'ArrowDown';
      let bestD = Infinity;
      for (const [j, b] of this.triangles.entries()) {
        const r = b.getBoundingClientRect();
        const dy = down ? r.top - here.top : here.top - r.top;
        if (dy < here.height * 0.5) continue;
        const d = dy * 4 + Math.abs(r.left - here.left);
        if (d < bestD) {
          bestD = d;
          next = j;
        }
      }
    }
    this.triangles[next]?.focus();
  }

  // ---------- reading ----------

  private async read(t: Triangle, from: HTMLElement): Promise<void> {
    if (this.reader || this.closing) return;
    this.reader = new Reader(this.root, t, this.opts.reduced);
    await this.reader.open();
    await this.reader.closed;
    this.reader = null;
    if (from.isConnected) from.focus();
  }

  // ---------- the player's replies ----------

  private mine(): HTMLElement {
    const list = h('ul', { class: 'dl-mine-list' });
    const section = h(
      'section',
      { class: 'dl-plate dl-mine', attrs: { 'aria-labelledby': 'dl-mine-title' } },
      h('h3', { class: 'dl-sub', text: 'Ваши ответы', attrs: { id: 'dl-mine-title' } }),
    );
    if (!this.opts.mine.length) {
      section.append(h('p', { class: 'dl-note', text: 'Вы ещё не писали домой. Ответ пишут на письмо из дома, когда оно придёт.' }));
      return section;
    }
    section.append(
      h('p', { class: 'dl-consent', text: 'Письмо, опущенное в ящик, могут прочитать игроки других казарм — после проверки и без вашего имени. Забрать его обратно нельзя.' }),
      list,
    );
    for (const reply of this.opts.mine) list.append(this.reply(reply));
    return section;
  }

  private reply(reply: MyReply): HTMLElement {
    const text = reply.text.replace(/\s+/g, ' ').trim();
    const excerpt = text.length > EXCERPT ? `${text.slice(0, EXCERPT).trimEnd()}…` : text;
    const status = h('p', { class: 'dl-status', attrs: { role: 'status' } });
    const item = h('li', { class: 'dl-reply' }, h('p', { class: 'dl-reply-to', text: `Кому: ${reply.to}` }), h('p', { class: 'dl-reply-text', text: excerpt }));
    if (reply.sent) {
      status.textContent = SENT_WORDS.ok;
      item.append(status);
      return item;
    }
    const send = h('button', { class: 'dl-btn dl-send', text: 'Опустить в ящик', attrs: { type: 'button' } });
    let armed = false;
    send.addEventListener('click', async () => {
      // Two presses: the second one is the consent.
      if (!armed) {
        armed = true;
        send.textContent = 'Да, опустить. Обратно не забрать';
        send.classList.add('dl-armed');
        status.textContent = '';
        return;
      }
      send.disabled = true;
      status.textContent = 'Опускаете…';
      const r = await this.opts.send(reply);
      if (r === 'ok') {
        this.sent.push(reply.n);
        status.textContent = SENT_WORDS.ok;
        const hadFocus = document.activeElement === send;
        send.remove();
        if (hadFocus) {
          // The button is gone; focus stays on the reply, where the word «Опущено» is.
          status.setAttribute('tabindex', '-1');
          status.focus();
        }
        return;
      }
      status.textContent = SENT_WORDS[r ?? 'offline'];
      armed = false;
      send.disabled = r === 'invalid';
      send.textContent = 'Опустить в ящик';
      send.classList.remove('dl-armed');
    });
    item.append(send, status);
    return item;
  }

  // ---------- keys and closing ----------

  /** Keys while the box is open: nothing reaches the barracks behind it, Tab stays inside. */
  private readonly onKey = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (this.reader) {
      this.reader.key(e);
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      void this.close();
      return;
    }
    if (e.code === 'Tab') {
      this.trapTab(e);
      return;
    }
    const target = e.target as HTMLElement;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && target.classList.contains('dl-tri')) {
      e.preventDefault();
      this.step(target, e.key);
    }
  };

  private trapTab(e: KeyboardEvent): void {
    const items = [...this.root.querySelectorAll<HTMLElement>('button, [tabindex="0"]')].filter((el) => !(el as HTMLButtonElement).disabled && el.offsetParent !== null);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === items.length - 1 ? 0 : i + 1;
    e.preventDefault();
    items[next]?.focus();
  }

  private async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    window.removeEventListener('keydown', this.onKey, true);
    this.root.classList.remove('dl-in');
    if (!this.opts.reduced) await wait(240);
    this.root.remove();
    if (this.previous instanceof HTMLElement && this.previous.isConnected) this.previous.focus();
    this.done([...this.sent]);
  }
}

/** One letter taken out of the crate: unfolded fold by fold, read, folded back. */
class Reader {
  private readonly t: Triangle;
  private readonly reduced: boolean;
  private readonly root: HTMLElement;
  private readonly sheetEl: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly textEl: HTMLElement;
  private readonly back: HTMLButtonElement;
  private art: SheetArt | null = null;
  private state: FoldState = { ...FOLDED };
  private busy = true;
  private finish: () => void = () => undefined;
  readonly closed: Promise<void>;
  private readonly onResize = () => this.layout();

  constructor(parent: HTMLElement, t: Triangle, reduced: boolean) {
    this.t = t;
    this.reduced = reduced;
    this.closed = new Promise((r) => (this.finish = r));
    this.canvas = h('canvas', { class: 'dl-canvas', attrs: { 'aria-hidden': 'true' } });
    this.textEl = h('div', { class: `dl-text dl-hand-${t.sheet.hand}`, attrs: { lang: 'ru', tabindex: '0', 'aria-label': 'Текст письма' } });
    for (const para of t.text.split('\n\n')) this.textEl.append(h('p', { text: para }));
    this.textEl.style.color = INK[t.sheet.hand];
    this.sheetEl = h('div', { class: 'dl-sheet' }, this.canvas, this.textEl);
    this.back = h('button', { class: 'dl-btn dl-main-btn', attrs: { type: 'button' } }, 'Сложить ', h('kbd', { text: 'Esc' }));
    this.back.addEventListener('click', () => void this.fold());
    const side = h(
      'div',
      { class: 'dl-plate dl-side' },
      h('h3', { class: 'dl-sub', text: `Кому: ${t.to}` }),
      h('p', { class: 'dl-meta', text: `${t.from[0]!.toUpperCase()}${t.from.slice(1)}.` }),
      t.stamp ? h('p', { class: 'dl-side-stamp' }, 'На штампе: ', h('span', { class: 'dl-stamp dl-stamp-inline', text: t.stamp })) : null,
      this.back,
    );
    this.root = h('div', { class: 'dl-reader', attrs: { role: 'group', 'aria-label': `Письмо. Кому: ${t.to}` } }, h('div', { class: 'dl-reader-body' }, this.sheetEl, side));
    parent.append(this.root);
    window.addEventListener('resize', this.onResize);
  }

  async open(): Promise<void> {
    if (document.fonts) await Promise.race([document.fonts.load('21px "Bad Script"', 'Кому'), wait(1200)]).catch(() => undefined);
    this.art = paintSheet(this.t.sheet, `Кому: ${this.t.to}`);
    this.layout();
    this.back.focus();
    for (const name of UNFOLD_ORDER) await this.move(name, 1);
    this.textEl.classList.add('dl-shown');
    this.placeText();
    this.busy = false;
  }

  key(e: KeyboardEvent): void {
    if (e.code === 'Escape') {
      e.preventDefault();
      void this.fold();
    } else if (e.code === 'Tab') {
      // Inside the open letter: the text (to scroll a long one) and the button.
      e.preventDefault();
      (document.activeElement === this.back ? this.textEl : this.back).focus();
    }
  }

  private async fold(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.textEl.classList.remove('dl-shown');
    for (const name of [...UNFOLD_ORDER].reverse()) await this.move(name, 0);
    if (!this.reduced) await wait(160);
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
    this.art = null;
    this.finish();
  }

  private async move(name: FlapName, to: number): Promise<void> {
    if (this.reduced) {
      this.state = { ...this.state, [name]: to };
      if (to === 1 && name === 'right') this.state = { ...OPEN };
      this.render();
      return;
    }
    const from = this.state[name];
    for (let i = 1; i <= FOLD_FRAMES; i++) {
      this.state = { ...this.state, [name]: from + ((to - from) * i) / FOLD_FRAMES };
      this.render();
      if (i < FOLD_FRAMES) await wait(FRAME_MS);
    }
  }

  private layout(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sideW = Math.min(340, Math.max(240, vw * 0.26));
    const availW = Math.max(220, vw - sideW - 96);
    const height = Math.min(vh * 0.86, availW * (H / W));
    const width = height * (W / H);
    this.sheetEl.style.width = `${width}px`;
    this.sheetEl.style.height = `${height}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.render();
    this.placeText();
  }

  private camera(): { s: number; x: number; y: number } {
    const b = bounds(this.state);
    const m = 16;
    const s = Math.min(this.canvas.width / (b.w + 2 * m), this.canvas.height / (b.h + 2 * m));
    return { s, x: (this.canvas.width - b.w * s) / 2 - b.x * s, y: (this.canvas.height - b.h * s) / 2 - b.y * s };
  }

  private render(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx || !this.art) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const cam = this.camera();
    ctx.setTransform(cam.s, 0, 0, cam.s, cam.x, cam.y);
    drawSheet(ctx, this.art, this.state);
  }

  /** The text over the open sheet, inside its margins; a long letter shrinks a little, then scrolls. */
  private placeText(): void {
    if (!this.textEl.classList.contains('dl-shown')) return;
    const dpr = this.canvas.width / (parseFloat(this.canvas.style.width) || 1);
    const cam = this.camera();
    const s = cam.s / dpr;
    this.textEl.style.left = `${cam.x / dpr + 38 * s}px`;
    this.textEl.style.top = `${cam.y / dpr + 30 * s}px`;
    this.textEl.style.width = `${(W - 38 - 22) * s}px`;
    this.textEl.style.height = `${(H - 30 - 24) * s}px`;
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    let size = 15.8 * s * (root / 16) * (this.t.sheet.hand === 'child' ? 1.06 : 1);
    const min = size * 0.84;
    this.textEl.style.fontSize = `${size}px`;
    while (this.textEl.scrollHeight > this.textEl.clientHeight + 1 && size > min) {
      size -= 0.5;
      this.textEl.style.fontSize = `${size}px`;
    }
  }
}
