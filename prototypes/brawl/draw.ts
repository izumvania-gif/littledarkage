/**
 * Drawing the room as a ROSTA poster: cream paper floor, black walls and silhouettes, flat poster red for
 * blood (stamped for good into the floor canvas), weapons outlined in cream so they read on red.
 */
import { REF_H, REF_W } from '../shared/frame.ts';
import { BUNKS, DOOR, STOVE, TABLE, TAPE, WALLS, type Pt } from './room.ts';
import { ITEM, type Actor, type Item, type ItemKind, type World } from './world.ts';

export const RED = '#c62f24';
export const CREAM = '#eadfc6';
export const INK = '#1c1a18';
const RIM = '#f2ead8';

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, color: string, size: [number, number]): void {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const s = size[0] + Math.random() * (size[1] - size[0]);
    ctx.globalAlpha = 0.05 + Math.random() * 0.12;
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

/** The pristine floor with its grain and fibres, drawn once. */
export function floorBase(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = REF_W;
  c.height = REF_H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, REF_W, REF_H);
  grain(ctx, REF_W, REF_H, 9000, '#3a3128', [1, 2.2]);
  grain(ctx, REF_W, REF_H, 2500, '#fff8ec', [1, 3]);
  // Floorboards: faint long lines.
  ctx.strokeStyle = 'rgba(60, 48, 36, 0.10)';
  ctx.lineWidth = 2;
  for (let y = 80; y < REF_H; y += 46) {
    ctx.beginPath();
    ctx.moveTo(0, y + Math.random() * 4);
    ctx.lineTo(REF_W, y + Math.random() * 4);
    ctx.stroke();
  }
  return c;
}

/** Walls, bunks, table, stove: they never change, so they are drawn once too. */
export function propsLayer(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = REF_W;
  c.height = REF_H;
  const ctx = c.getContext('2d')!;
  for (const b of BUNKS) {
    ctx.fillStyle = INK;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // Two tiers seen from above: a cream blanket with a fold and a pillow.
    const v = b.h > b.w;
    ctx.fillStyle = '#d9cdb2';
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = INK;
    if (v) {
      ctx.fillRect(b.x + 6, b.y + b.h * 0.42, b.w - 12, 5);
      ctx.fillStyle = CREAM;
      ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, 18);
    } else {
      ctx.fillRect(b.x + b.w * 0.42, b.y + 6, 5, b.h - 12);
      ctx.fillStyle = CREAM;
      ctx.fillRect(b.x + 10, b.y + 10, 18, b.h - 20);
    }
  }
  // Table and the tape recorder on it.
  const t = TABLE;
  ctx.fillStyle = INK;
  ctx.fillRect(t.x, t.y, t.w, t.h);
  ctx.strokeStyle = '#4a4138';
  ctx.lineWidth = 2;
  ctx.strokeRect(t.x + 5, t.y + 5, t.w - 10, t.h - 10);
  // Stove: a black block with a cream hob ring.
  const s = STOVE;
  ctx.fillStyle = INK;
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(s.x + s.w / 2, s.y + s.h / 2, 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s.x + s.w / 2, s.y + s.h / 2, 8, 0, Math.PI * 2);
  ctx.stroke();
  // Walls last, solid black.
  ctx.fillStyle = INK;
  for (const w of WALLS) ctx.fillRect(w.x, w.y, w.w, w.h);
  // The far door: a gap with a door leaf ajar.
  ctx.fillStyle = '#3b332b';
  ctx.fillRect(DOOR.x, DOOR.y, DOOR.w, DOOR.h);
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(DOOR.x + 4, DOOR.y + DOOR.h);
  ctx.lineTo(DOOR.x + DOOR.w - 18, DOOR.y + 14);
  ctx.stroke();
  return c;
}

/** The tape recorder on the table; its reels turn while it plays. */
export function drawTape(ctx: CanvasRenderingContext2D, on: boolean, time: number, highlight: boolean): void {
  const x = TAPE.x;
  const y = TAPE.y;
  if (highlight) {
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(x - 40, y - 24, 80, 48);
    ctx.setLineDash([]);
  }
  ctx.fillStyle = CREAM;
  ctx.fillRect(x - 32, y - 17, 64, 34);
  ctx.fillStyle = INK;
  for (const dx of [-14, 14]) {
    ctx.save();
    ctx.translate(x + dx, y - 2);
    ctx.rotate(on ? time * 9 : 0);
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CREAM;
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.fillRect(-1.5, -8, 3, 5);
    }
    ctx.fillStyle = INK;
    ctx.restore();
  }
  ctx.fillRect(x - 20, y + 10, 40, 3);
}

// ---------- blood ----------

/** A flat splat and spray in the direction of the blow. Size ~ how hard. */
export function splat(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, size: number): void {
  ctx.fillStyle = RED;
  blob(ctx, x, y, size * 0.7);
  const drops = Math.round(size * 0.9);
  for (let i = 0; i < drops; i++) {
    const a = dir + (Math.random() - 0.5) * 1.1;
    const d = size * (0.6 + Math.random() * 2.8);
    const r = Math.max(1.2, size * (0.08 + Math.random() * 0.18) * (1 - d / (size * 4)));
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Streaks: thin ellipses along the blow.
  for (let i = 0; i < Math.round(size / 5); i++) {
    const a = dir + (Math.random() - 0.5) * 0.6;
    const d = size * (1 + Math.random() * 1.6);
    ctx.save();
    ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * (0.3 + Math.random() * 0.5), 1.6 + Math.random() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** A pool under a body. */
export function pool(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.fillStyle = RED;
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * size * 0.5;
    blob(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, size * (0.45 + Math.random() * 0.35));
  }
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.8 + Math.random() * 0.35);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// ---------- rats ----------

export interface RatLook {
  fill: string;
  outline?: string;
  armband?: boolean;
  cap?: boolean;
  beard?: boolean;
  lying?: boolean;
  marker?: boolean;
}

export function lookOf(a: Actor): RatLook {
  switch (a.kind) {
    case 'player':
      return { fill: INK, armband: true, marker: true };
    case 'ally':
      return { fill: INK, armband: true };
    case 'general':
      return { fill: INK, cap: true };
    case 'krypotkin':
      return { fill: '#6e6458', beard: true };
    default:
      return { fill: INK };
  }
}

/** A rat from above, facing +x in local space: tail, body, head with snout and ears, two hands. */
export function drawRat(ctx: CanvasRenderingContext2D, x: number, y: number, face: number, look: RatLook, hold: ItemKind | null, swingT: number, swingDir: number | null): void {
  ctx.save();
  ctx.translate(x, y);
  if (look.marker) {
    // The player: a ring on the floor, readable on cream and on red alike.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.rotate(face);
  ctx.scale(1.15, 1.15);
  if (look.lying) ctx.scale(1.12, 0.92);
  const path = () => {
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 12, 0, 0, Math.PI * 2);
    ctx.moveTo(22, 0);
    ctx.ellipse(12, 0, 9.5, 8, 0, 0, Math.PI * 2);
  };
  // Tail.
  ctx.strokeStyle = look.fill;
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-13, 0);
  ctx.quadraticCurveTo(-26, look.lying ? 14 : 8, -36, look.lying ? 4 : -2);
  ctx.stroke();
  if (look.outline) {
    ctx.strokeStyle = look.outline;
    ctx.lineWidth = 5;
    path();
    ctx.stroke();
  }
  ctx.fillStyle = look.fill;
  path();
  ctx.fill();
  // Snout and ears.
  ctx.beginPath();
  ctx.moveTo(18, -5);
  ctx.lineTo(29, 0);
  ctx.lineTo(18, 5);
  ctx.fill();
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(8, s * 8.5, 4.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (look.beard) {
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.moveTo(16, -5);
    ctx.lineTo(27, 0);
    ctx.lineTo(16, 5);
    ctx.lineTo(12, 0);
    ctx.fill();
  }
  if (look.cap) {
    ctx.fillStyle = '#3b332b';
    ctx.beginPath();
    ctx.ellipse(11, 0, 10, 10.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(11, 0, 10, -0.9, 0.9);
    ctx.stroke();
  }
  if (look.armband) {
    ctx.fillStyle = RIM;
    ctx.fillRect(-4, -13.5, 9, 4.5);
  }
  // Hands; the right one holds the weapon and swings it through the arc.
  const swing = swingDir === null ? 0 : (1 - swingT) * 1.9 - 0.95;
  ctx.fillStyle = look.fill;
  ctx.beginPath();
  ctx.arc(7, -12, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(6, 12);
  if (swingT > 0) ctx.rotate(-swing);
  ctx.beginPath();
  ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
  ctx.fill();
  if (hold) {
    ctx.rotate(-0.35);
    drawItemShape(ctx, hold, 4, 0, false);
  }
  ctx.restore();
  ctx.restore();
}

/** A weapon in local space pointing +x from (x, y). On the floor it gets a cream outline. */
export function drawItemShape(ctx: CanvasRenderingContext2D, kind: ItemKind, x: number, y: number, outlined: boolean): void {
  const shape = () => {
    ctx.beginPath();
    switch (kind) {
      case 'stool':
        ctx.rect(x + 6, y - 9, 18, 18);
        break;
      case 'leg':
        ctx.rect(x, y - 3.5, 32, 7);
        break;
      case 'poker':
        ctx.rect(x, y - 2, 38, 4);
        ctx.rect(x + 34, y - 2, 4, 10);
        break;
      case 'mug':
        ctx.arc(x + 9, y, 7, 0, Math.PI * 2);
        ctx.rect(x + 14, y - 2.5, 6, 5);
        break;
      case 'boot':
        ctx.rect(x, y - 5, 14, 10);
        ctx.rect(x + 10, y - 5, 10, 14);
        break;
    }
  };
  if (outlined) {
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    shape();
    ctx.stroke();
  }
  ctx.fillStyle = INK;
  shape();
  ctx.fill();
  if (kind === 'stool') {
    ctx.fillStyle = CREAM;
    for (const [dx, dy] of [
      [9, -6],
      [21, -6],
      [9, 6],
      [21, 6],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawItem(ctx: CanvasRenderingContext2D, it: Item): void {
  ctx.save();
  ctx.translate(it.x, it.y);
  ctx.rotate(it.rot);
  const len = it.kind === 'leg' ? 32 : it.kind === 'poker' ? 38 : 22;
  drawItemShape(ctx, it.kind, -len / 2, 0, true);
  ctx.restore();
}

/** The body left on the floor for good: black, in a red pool. */
export function stampBody(ctx: CanvasRenderingContext2D, a: Actor, dir: number): void {
  pool(ctx, a.x + Math.cos(dir) * 12, a.y + Math.sin(dir) * 12, 36);
  const look = { ...lookOf(a), lying: true, outline: undefined, marker: false };
  drawRat(ctx, a.x, a.y, dir + (Math.random() - 0.5) * 0.8, look, null, 0, null);
}

// ---------- overlays ----------

export function drawWindup(ctx: CanvasRenderingContext2D, a: Actor, reachPx: number, k: number): void {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.35 + 0.65 * k;
  ctx.lineWidth = 3 + 3 * k;
  ctx.beginPath();
  ctx.arc(a.x, a.y, reachPx, a.swing - 0.95, a.swing + 0.95);
  ctx.stroke();
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(a.x, a.y, reachPx, a.swing - 0.95, a.swing + 0.95);
  ctx.stroke();
  ctx.restore();
}

export function drawVoice(ctx: CanvasRenderingContext2D, center: Pt, poly: Pt[], k: number, radius: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.max(1, radius * Math.min(1, k)), 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = 'rgba(28, 26, 24, 0.22)';
  ctx.fill();
  ctx.restore();
  // The full reach as a dashed outline, so the player sees where to hide.
  ctx.save();
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.setLineDash([10, 7]);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

export function drawFrozen(ctx: CanvasRenderingContext2D, a: Actor): void {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.arc(a.x, a.y, a.r + 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  for (const [c, w] of [
    [CREAM, 5],
    [INK, 2],
  ] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x - 4, y);
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + 10, y);
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y - 4);
    ctx.moveTo(x, y + 4);
    ctx.lineTo(x, y + 10);
    ctx.stroke();
  }
}

/** ?debug: states, sight cones, paths. */
export function drawDebug(ctx: CanvasRenderingContext2D, w: World): void {
  ctx.save();
  ctx.font = '12px "PT Mono", monospace';
  for (const a of w.actors) {
    if (a.state === 'dead' || a.state === 'gone') continue;
    ctx.fillStyle = INK;
    ctx.fillRect(a.x - 34, a.y - 38, 68, 15);
    ctx.fillStyle = CREAM;
    ctx.fillText(`${a.state}${a.freeze > 0 ? ' ❄' : ''}`, a.x - 31, a.y - 27);
    if (a.kind === 'man' && a.state === 'stand') {
      ctx.fillStyle = 'rgba(28,26,24,0.08)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.arc(a.x, a.y, 560, a.face - Math.PI / 3, a.face + Math.PI / 3);
      ctx.closePath();
      ctx.fill();
    }
    if (a.path.length) {
      ctx.strokeStyle = 'rgba(28,26,24,0.5)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      for (const p of a.path) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (a.kind === 'man' && a.target && a.state !== 'stand' && a.state !== 'down') {
      ctx.strokeStyle = 'rgba(198,47,36,0.5)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.target.x, a.target.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export const reachOf = (a: Actor) => (a.hold ? ITEM[a.hold].reach : 40);
