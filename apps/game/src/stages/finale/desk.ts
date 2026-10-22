/**
 * The general's desk, seen from above under his lamp (concept «Финал»: «То, что игрок сделал, видно в финале и в
 * книге учёта»). The book of records lies open: earlier playthroughs' soldiers crossed out on the left page, this
 * run's on the right. Beside it a stack of soldier's triangles to the player's names, «Адресат выбыл», and the
 * white envelopes the general addresses, the ones families dread (letter 5). The paper is drawn in Pixi; every word
 * on it is DOM laid over the frame, on the paper's own colour, so it stays sharp and readable.
 */
import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import { addressee } from '../../content/letters.ts';
import { seededRng } from '../../core/rng.ts';
import { glowTexture, grainTexture, vignetteTexture } from '../../render/kit.ts';
import { CAPTION_TOP, MATTE, REF_H, REF_W } from '../../render/palette.ts';
import type { Fit } from '../../render/stage.ts';
import { h } from '../../ui/dom.ts';
import { registerPage } from './plan.ts';
import type { RegisterEntry } from './types.ts';

const BOOK = { x: 210, y: 46, pageW: 280, pageH: 430, gutter: 8 } as const;
const TRI = { x: 900, y: 30, w: 200, h: 118, step: 66 } as const;
const ENV = { x: 850, y: 300, w: 300, h: 166 } as const;
/** Lines a page of the book holds. */
const PAGE_LINES = 11;
/** Triangles drawn in the stack; more names than this share the last one. */
const MAX_TRIANGLES = 4;

const PAPER = { page: 0xe6dbc3, rule: 0xc8b896, triangle: 0xddd1b6, fold: 0xb9a985, envelope: 0xf3f0e8, envelopeFold: 0xd8d3c8 } as const;

export interface DeskScene {
  view: Container;
  /** The words on the desk, laid over the frame. */
  overlay: HTMLElement;
  layout(fit: Fit): void;
  /** The lamp: 0 off, 1 on. */
  setLight(k: number): void;
  /** Types the address on the top envelope; `key` sounds each keystroke. */
  address(text: string, key: () => void, reduced: boolean): Promise<void>;
  /** The general's pen strikes the last line of the book (the player's). */
  strike(reduced: boolean): Promise<void>;
  destroy(): void;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A soldier's triangle seen from the front: a wide top edge, the point down, the flap's fold lines. */
function triangle(g: Graphics, x: number, y: number, w: number, hgt: number): void {
  g.poly([x, y, x + w, y, x + w / 2, y + hgt]).fill(PAPER.triangle);
  g.moveTo(x, y).lineTo(x + w * 0.62, y + hgt * 0.62).moveTo(x + w, y).lineTo(x + w * 0.38, y + hgt * 0.62).stroke({ width: 1.4, color: PAPER.fold });
  g.poly([x, y, x + w, y, x + w / 2, y + hgt]).stroke({ width: 1.2, color: 0x8f7f60 });
}

function envelope(g: Graphics, x: number, y: number, w: number, hgt: number): void {
  g.rect(x, y, w, hgt).fill(PAPER.envelope).rect(x, y, w, hgt).stroke({ width: 1.2, color: 0xa9a397 });
  g.moveTo(x, y).lineTo(x + w / 2, y + hgt * 0.5).lineTo(x + w, y).stroke({ width: 1.2, color: PAPER.envelopeFold });
}

export function buildDesk(ui: HTMLElement, opts: { register: readonly RegisterEntry[]; triangles: readonly string[]; envelope: string }): DeskScene {
  const view = new Container();

  // ---- the desk under the lamp ----
  const wood = new Graphics().rect(0, 0, REF_W, CAPTION_TOP).fill(0x2a1f17);
  const r = seededRng(41);
  for (let y = 0; y < CAPTION_TOP; y += 46) {
    wood.moveTo(0, y).lineTo(REF_W, y + (r() - 0.5) * 3).stroke({ width: 2, color: 0x1a130e, alpha: 0.9 });
    for (let k = 0; k < 6; k++) {
      const x = r() * REF_W;
      wood.moveTo(x, y + 8 + r() * 30).lineTo(x + 80 + r() * 160, y + 10 + r() * 30).stroke({ width: 1, color: 0x3a2b20, alpha: 0.6 });
    }
  }
  view.addChild(wood);
  // The lamp's pool on the wood and the room around it in the dark. The paper lies above both, in flat colours,
  // so the words over it keep their contrast.
  const pool = new Sprite(glowTexture(256));
  pool.anchor.set(0.5);
  pool.position.set(640, 250);
  pool.width = 1500;
  pool.height = 900;
  pool.tint = 0xf2d6a0;
  pool.alpha = 0.22;
  pool.blendMode = 'add';
  view.addChild(pool);
  view.addChild(new Sprite(vignetteTexture(REF_W, REF_H, 0.85)));
  view.addChild(new Graphics().rect(0, CAPTION_TOP, REF_W, REF_H - CAPTION_TOP).fill(0x0f0e0d));

  // ---- the book of records, open ----
  const book = new Graphics()
    .rect(BOOK.x + 6, BOOK.y + 10, BOOK.pageW * 2 + BOOK.gutter + 16, BOOK.pageH + 12).fill({ color: 0x000000, alpha: 0.45 })
    .rect(BOOK.x - 8, BOOK.y - 6, BOOK.pageW * 2 + BOOK.gutter + 16, BOOK.pageH + 12).fill(0x4a2320);
  const leftX = BOOK.x;
  const rightX = BOOK.x + BOOK.pageW + BOOK.gutter;
  for (const px of [leftX, rightX]) {
    book.rect(px, BOOK.y, BOOK.pageW, BOOK.pageH).fill(PAPER.page);
    for (let i = 0; i < PAGE_LINES + 1; i++) book.moveTo(px + 14, BOOK.y + 58 + i * 32).lineTo(px + BOOK.pageW - 14, BOOK.y + 58 + i * 32).stroke({ width: 1, color: PAPER.rule });
    book.moveTo(px + 44, BOOK.y + 30).lineTo(px + 44, BOOK.y + BOOK.pageH - 12).stroke({ width: 1, color: 0xc98f80 });
  }
  book.rect(BOOK.x + BOOK.pageW - 6, BOOK.y, BOOK.gutter + 12, BOOK.pageH).fill({ color: 0x5a4a35, alpha: 0.35 });
  view.addChild(book);

  // ---- triangles to the player's names ----
  const tris = new Graphics();
  const shown = opts.triangles.slice(0, MAX_TRIANGLES);
  shown.forEach((_, i) => {
    tris.poly([TRI.x + 6, TRI.y + i * TRI.step + 8, TRI.x + TRI.w + 6, TRI.y + i * TRI.step + 8, TRI.x + TRI.w / 2 + 6, TRI.y + i * TRI.step + TRI.h + 8]).fill({ color: 0x000000, alpha: 0.35 });
    triangle(tris, TRI.x + (i % 2 ? 10 : -6), TRI.y + i * TRI.step, TRI.w, TRI.h);
  });
  view.addChild(tris);

  // ---- white envelopes, a pen, the inkwell ----
  const env = new Graphics();
  for (let i = 3; i >= 0; i--) {
    env.rect(ENV.x + 8 + i * 10, ENV.y + 10 - i * 7, ENV.w, ENV.h).fill({ color: 0x000000, alpha: 0.3 });
    envelope(env, ENV.x + i * 10, ENV.y - i * 7, ENV.w, ENV.h);
  }
  env.roundRect(ENV.x + ENV.w + 40, ENV.y + 20, 8, 150, 3).fill(0x141110).circle(ENV.x + ENV.w + 44, ENV.y + 172, 3).fill(0x8a8070);
  env.circle(1190, 70, 30).fill(0x141110).circle(1190, 70, 18).fill(0x090807);
  view.addChild(env);

  const grain = new TilingSprite({ texture: grainTexture(160, 9), width: REF_W, height: REF_H });
  grain.alpha = 0.05;
  view.addChild(grain);
  const dark = new Graphics().rect(0, 0, REF_W, REF_H).fill(MATTE);
  view.addChild(dark);

  // ---- the words ----
  const at = (el: HTMLElement, x: number, y: number, w: number, hh?: number) => {
    el.style.left = `calc(${x} * var(--u))`;
    el.style.top = `calc(${y} * var(--u))`;
    el.style.width = `calc(${w} * var(--u))`;
    if (hh !== undefined) el.style.height = `calc(${hh} * var(--u))`;
    return el;
  };
  const entry = (e: RegisterEntry) =>
    h('li', { class: e.crossed ? 'fn-crossed' : '' }, h('span', { class: 'fn-name', text: e.name }), e.note ? h('span', { class: 'fn-note', text: ` — ${e.note}` }) : null);
  const earlier = registerPage(opts.register.filter((e) => e.crossed), PAGE_LINES - 1);
  const now = registerPage(opts.register.filter((e) => !e.crossed), PAGE_LINES);
  const left = at(
    h(
      'div',
      { class: 'fn-page' },
      h('p', { class: 'fn-book-title', text: 'Книга учёта' }),
      earlier.earlier ? h('p', { class: 'fn-more', text: `…и ещё ${earlier.earlier} выше` }) : null,
      h('ol', { class: 'fn-entries' }, ...earlier.shown.map(entry)),
    ),
    leftX + 52,
    BOOK.y + 14,
    BOOK.pageW - 66,
    BOOK.pageH - 28,
  );
  const rightList = h('ol', { class: 'fn-entries' }, ...now.shown.map(entry));
  const right = at(h('div', { class: 'fn-page' }, h('p', { class: 'fn-book-title', text: ' ' }), rightList), rightX + 52, BOOK.y + 14, BOOK.pageW - 66, BOOK.pageH - 28);
  const labels = shown.map((name, i) => {
    const more = i === MAX_TRIANGLES - 1 && opts.triangles.length > MAX_TRIANGLES;
    return at(
      h('div', { class: 'fn-tri' }, h('p', { class: 'fn-tri-to', text: more ? `${addressee(name)} и др.` : addressee(name) }), h('p', { class: 'fn-stamp', text: 'Адресат выбыл' })),
      TRI.x + (i % 2 ? 10 : -6) + 40,
      TRI.y + i * TRI.step + 5,
      TRI.w - 80,
    );
  });
  const envText = h('p', { class: 'fn-env-to' });
  const envLabel = at(h('div', { class: 'fn-env' }, envText), ENV.x + 40, ENV.y + ENV.h * 0.56, ENV.w - 80);
  envLabel.hidden = true;
  const overlay = h('section', { class: 'fn-desk', attrs: { 'aria-label': 'Стол генерала' } }, left, right, ...labels, envLabel);
  ui.append(overlay);

  return {
    view,
    overlay,
    layout(fit: Fit) {
      const s = overlay.style;
      s.setProperty('--u', `${fit.scale}px`);
      s.left = `${fit.x}px`;
      s.top = `${fit.y}px`;
      s.width = `${REF_W * fit.scale}px`;
      s.height = `${CAPTION_TOP * fit.scale}px`;
    },
    setLight(k: number) {
      const v = Math.max(0, Math.min(1, k));
      dark.alpha = 1 - v;
      overlay.style.opacity = String(v);
    },
    async address(text: string, key: () => void, reduced: boolean) {
      envLabel.hidden = false;
      if (reduced) {
        envText.textContent = text;
        return;
      }
      for (let i = 0; i < text.length; i++) {
        envText.textContent = text.slice(0, i + 1);
        if (text.charAt(i).trim()) key();
        await wait(70);
      }
    },
    async strike(reduced: boolean) {
      const last = rightList.lastElementChild;
      if (!last) return;
      last.classList.add('fn-striking');
      if (!reduced) await wait(900);
      last.classList.add('fn-crossed');
    },
    destroy() {
      overlay.remove();
      view.destroy({ children: true });
    },
  };
}
