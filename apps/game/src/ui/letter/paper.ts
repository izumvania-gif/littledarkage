/**
 * The paper of a letter, all drawn in code: an aged sheet (fibres, grain, stains, worn edges, creases)
 * and how it folds into a soldier's triangle. Letters are perekladka from the first day (concept «Стиль»),
 * so no poster here.
 *
 * Geometry, in sheet units (W × H, portrait). The top square is cut by its two diagonals into three parts
 * that never move together: the core (the triangle that stays put), the left flap and the right flap; the
 * strip below the square is the third flap. Folded: the right flap over the left half, the left flap over the
 * core, the strip tucked under it. The triangle you hold is the core with the left flap's outside on top,
 * where the address and the stamps are.
 */
import type { Letter, LetterHand, LetterPaper } from '../../content/letters.ts';

export const W = 400;
export const H = 560;
/** Texture pixels per sheet unit. */
const RES = 2;

export type Pt = readonly [number, number];

export interface Flap {
  /** The flap where it lies on the open sheet. */
  poly: readonly Pt[];
  /** The fold line: a point on it and its direction. */
  at: Pt;
  dir: Pt;
}

export const CORE: readonly Pt[] = [
  [0, W],
  [W, W],
  [W / 2, W / 2],
];

export const FLAPS = {
  /** The strip below the square folds up and is tucked under the left flap. */
  strip: { poly: [[0, W], [W, W], [W, H], [0, H]], at: [0, W], dir: [1, 0] } as Flap,
  left: {
    poly: [
      [0, 0],
      [0, W],
      [W / 2, W / 2],
    ],
    at: [0, W],
    dir: [Math.SQRT1_2, -Math.SQRT1_2],
  } as Flap,
  right: {
    poly: [
      [0, 0],
      [W, 0],
      [W, W],
    ],
    at: [0, 0],
    dir: [Math.SQRT1_2, Math.SQRT1_2],
  } as Flap,
};

export type FlapName = keyof typeof FLAPS;

/** How open each flap is, 0 folded to 1 open. They open strip → left → right and close the other way. */
export interface FoldState {
  strip: number;
  left: number;
  right: number;
}

export const FOLDED: FoldState = { strip: 0, left: 0, right: 0 };
export const OPEN: FoldState = { strip: 1, left: 1, right: 1 };

/**
 * The flip of a flap as a 2D affine map around its fold line: the part of each point across the line is
 * scaled by cos θ, θ going from π (folded flat, mirrored) to 0 (open). Below zero we see the outside.
 */
export function flipMatrix(f: Flap, open: number): [number, number, number, number, number, number] {
  const c = Math.cos(Math.PI * (1 - open));
  const [ux, uy] = f.dir;
  const nx = -uy;
  const ny = ux;
  const a = ux * ux + c * nx * nx;
  const b = ux * uy + c * nx * ny;
  const d = uy * uy + c * ny * ny;
  const [px, py] = f.at;
  return [a, b, b, d, px - (a * px + b * py), py - (b * px + d * py)];
}

export function apply(m: readonly number[], [x, y]: Pt): Pt {
  return [m[0]! * x + m[2]! * y + m[4]!, m[1]! * x + m[3]! * y + m[5]!];
}

// ---------- the textures ----------

function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = W * RES;
  c.height = H * RES;
  const ctx = c.getContext('2d')!;
  ctx.scale(RES, RES);
  return [c, ctx];
}

/** The ink of each hand, dark enough on the paper for 4.5:1 and more. */
export const INK: Record<LetterHand, string> = {
  pen: '#26304f',
  pencil: '#45423f',
  child: '#3a3557',
  typed: '#27231f',
};

/** The sheet's outline with a worn, slightly torn edge. */
function wornOutline(r: () => number): Path2D {
  const p = new Path2D();
  const jitter = (k = 1.6) => (r() - 0.5) * k;
  const step = 8;
  p.moveTo(1 + jitter(), 1 + jitter());
  for (let x = step; x < W; x += step) p.lineTo(x, 1 + jitter() + (r() < 0.04 ? 3 : 0));
  for (let y = 0; y < H; y += step) p.lineTo(W - 1 + jitter() - (r() < 0.04 ? 3 : 0), y);
  for (let x = W; x > 0; x -= step) p.lineTo(x, H - 1 + jitter() - (r() < 0.04 ? 3 : 0));
  for (let y = H; y > 0; y -= step) p.lineTo(1 + jitter() + (r() < 0.04 ? 3 : 0), y);
  p.closePath();
  return p;
}

/** Aged paper: warm base, darker edges, grain, fibres and a few old stains. */
function paper(ctx: CanvasRenderingContext2D, seed: number, outline: Path2D, worn: number): void {
  const r = rng(seed);
  ctx.save();
  ctx.clip(outline);
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, '#e6dabd');
  g.addColorStop(0.65, '#d9c8a3');
  g.addColorStop(1, `rgb(${196 - worn * 14}, ${176 - worn * 16}, ${134 - worn * 14})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Fibres.
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 520; i++) {
    const x = r() * W;
    const y = r() * H;
    const a = r() * Math.PI;
    const len = 3 + r() * 9;
    ctx.strokeStyle = r() < 0.5 ? 'rgba(120, 92, 55, 0.08)' : 'rgba(255, 250, 235, 0.12)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (r() - 0.5) * 3, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // Stains: tea, damp, a thumb.
  const stains = 2 + Math.floor(r() * 3) + worn;
  for (let i = 0; i < stains; i++) {
    const x = r() * W;
    const y = r() * H;
    const rad = 14 + r() * 46;
    const s = ctx.createRadialGradient(x, y, rad * 0.2, x, y, rad);
    s.addColorStop(0, `rgba(150, 110, 60, ${0.05 + r() * 0.06})`);
    s.addColorStop(0.85, `rgba(140, 100, 52, ${0.07 + r() * 0.06})`);
    s.addColorStop(1, 'rgba(140, 100, 52, 0)');
    ctx.fillStyle = s;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  if (r() < 0.6) {
    // A ring where a mug stood.
    const x = 60 + r() * (W - 120);
    const y = 80 + r() * (H - 160);
    const rad = 26 + r() * 10;
    ctx.lineWidth = 2.2;
    for (let a = 0; a < Math.PI * 2; a += 0.12) {
      ctx.strokeStyle = `rgba(120, 82, 40, ${0.05 + r() * 0.08})`;
      ctx.beginPath();
      ctx.arc(x, y, rad + (r() - 0.5) * 1.5, a, a + 0.14);
      ctx.stroke();
    }
  }
  // Darker, softer edges.
  const e = ctx.createLinearGradient(0, 0, W, 0);
  e.addColorStop(0, 'rgba(110, 80, 40, 0.16)');
  e.addColorStop(0.06, 'rgba(110, 80, 40, 0)');
  e.addColorStop(0.94, 'rgba(110, 80, 40, 0)');
  e.addColorStop(1, 'rgba(110, 80, 40, 0.16)');
  ctx.fillStyle = e;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Grain on the whole texture (per pixel, so it is done in device pixels). */
function grain(c: HTMLCanvasElement, seed: number, amount: number): void {
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const r = rng(seed);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = (r() - 0.5) * amount;
    d[i] = d[i]! + n;
    d[i + 1] = d[i + 1]! + n;
    d[i + 2] = d[i + 2]! + n * 0.8;
  }
  ctx.putImageData(img, 0, 0);
}

function ruling(ctx: CanvasRenderingContext2D, kind: LetterPaper, outline: Path2D): void {
  if (kind === 'plain') return;
  ctx.save();
  ctx.clip(outline);
  ctx.lineWidth = 0.7;
  if (kind === 'lined') {
    ctx.strokeStyle = 'rgba(70, 95, 130, 0.22)';
    for (let y = 58; y < H - 10; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(170, 60, 50, 0.28)';
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(30, H);
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(70, 100, 140, 0.18)';
    for (let v = 10; v < Math.max(W, H); v += 12) {
      ctx.beginPath();
      ctx.moveTo(v, 0);
      ctx.lineTo(v, H);
      ctx.moveTo(0, v);
      ctx.lineTo(W, v);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Worn creases along the fold lines: a light ridge beside a dark valley. */
function creases(ctx: CanvasRenderingContext2D, outline: Path2D, seed: number): void {
  const r = rng(seed);
  const lines: [Pt, Pt][] = [
    [
      [0, 0],
      [W, W],
    ],
    [
      [0, W],
      [W, 0],
    ],
    [
      [0, W],
      [W, W],
    ],
  ];
  ctx.save();
  ctx.clip(outline);
  for (const [a, b] of lines) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    for (const [off, color, width] of [
      [1.2, 'rgba(255, 252, 240, 0.35)', 1.6],
      [-0.6, 'rgba(95, 70, 40, 0.30)', 1.1],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const w = (r() - 0.5) * 0.8;
        const x = a[0] + dx * t + nx * (off + w);
        const y = a[1] + dy * t + ny * (off + w);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // The paper stays a little bent: a soft shade on one side of the crease.
    const g = ctx.createLinearGradient(a[0] + (dx / 2), a[1] + dy / 2, a[0] + dx / 2 + nx * 18, a[1] + dy / 2 + ny * 18);
    g.addColorStop(0, 'rgba(90, 64, 34, 0.08)');
    g.addColorStop(1, 'rgba(90, 64, 34, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(b[0] + nx * 18, b[1] + ny * 18);
    ctx.lineTo(a[0] + nx * 18, a[1] + ny * 18);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function stampRound(ctx: CanvasRenderingContext2D, x: number, y: number, post: string, seed: number): void {
  const r = rng(seed);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.25 + r() * 0.2);
  ctx.strokeStyle = 'rgba(96, 52, 92, 0.72)';
  ctx.fillStyle = 'rgba(96, 52, 92, 0.72)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, 27, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.stroke();
  // «ПОЛЕВАЯ ПОЧТА» around the ring.
  ctx.font = '6.4px "PT Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = 'ПОЛЕВАЯ ПОЧТА • ПОЛЕВАЯ ПОЧТА •';
  for (let i = 0; i < words.length; i++) {
    const a = (i / words.length) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(words[i]!, 0, -22.5);
    ctx.restore();
  }
  ctx.font = '8px "PT Mono", monospace';
  ctx.fillText(post, 0, -3);
  ctx.font = '6px "PT Mono", monospace';
  ctx.fillText('— 4 —', 0, 7);
  ctx.restore();
}

function stampCensor(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number): void {
  const r = rng(seed);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.05 - r() * 0.12);
  ctx.strokeStyle = 'rgba(40, 52, 96, 0.6)';
  ctx.fillStyle = 'rgba(40, 52, 96, 0.6)';
  ctx.lineWidth = 1.1;
  ctx.strokeRect(-52, -12, 104, 24);
  ctx.font = '6.3px "PT Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ПРОСМОТРЕНО', 0, -5);
  ctx.fillText(`ВОЕННОЙ ЦЕНЗУРОЙ ${10 + Math.floor(r() * 80)}`, 0, 5);
  ctx.restore();
}

/** Ink that faded unevenly: draws the text, then knocks parts of it back. */
function handLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, ink: string): void {
  ctx.font = `${size}px "Bad Script", "Segoe Script", cursive`;
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

export interface SheetArt {
  /** The inside, where the letter is written. */
  front: HTMLCanvasElement;
  /** The outside of the left flap: the face of the triangle, with the address and the stamps. */
  backLeft: HTMLCanvasElement;
  /** The outside of the other flaps. */
  back: HTMLCanvasElement;
}

const fit = (ctx: CanvasRenderingContext2D, text: string, size: number, max: number): number => {
  ctx.font = `${size}px "Bad Script", cursive`;
  const w = ctx.measureText(text).width;
  return w > max ? (size * max) / w : size;
};

/** Paints a letter's sheet. `to` is the address line («Кому: …»); without it the triangle face is blank. */
export function paintSheet(l: Letter, to: string | null): SheetArt {
  const seed = 7919 * l.n;
  const r = rng(seed);
  const outline = wornOutline(r);
  const worn = l.hand === 'child' ? 1 : 0;

  const [front, f] = canvas();
  paper(f, seed + 1, outline, worn);
  ruling(f, l.paper, outline);
  creases(f, outline, seed + 2);
  grain(front, seed + 3, 16);

  const [back, b] = canvas();
  paper(b, seed + 4, outline, worn + 1);
  creases(b, outline, seed + 5);
  grain(back, seed + 6, 18);

  const [backLeft, bl] = canvas();
  bl.drawImage(back, 0, 0, W, H);
  if (to) {
    // Written where the face of the triangle will be: drawn through the left fold's mirror, so that
    // folding it over turns it the right way round.
    bl.save();
    const m = flipMatrix(FLAPS.left, 0);
    bl.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    const ink = INK[l.hand];
    stampCensor(bl, 200, 276, seed + 7);
    const lines: [string, number][] = [
      [`Полевая почта № ${l.post}-Б`, 314],
      [to, 345],
      [l.fromLine, 376],
    ];
    for (const [text, y] of lines) {
      const room = 2 * (y - 200) - 46;
      handLine(bl, text, 200, y, fit(bl, text, 21, room), ink);
    }
    stampRound(bl, 318, 368, l.post, seed + 8);
    bl.restore();
  }
  return { front, backLeft, back };
}

// ---------- drawing a state ----------

const SHADE = 'rgba(30, 20, 10, ';

/** Draws the sheet at a fold state, in sheet units (the caller sets the view transform). */
export function drawSheet(ctx: CanvasRenderingContext2D, art: SheetArt, s: FoldState): void {
  const poly = (pts: readonly Pt[]) => {
    const p = new Path2D();
    pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return p;
  };
  // What lies open in place: the core always, each flap once fully open.
  const inPlace: (readonly Pt[])[] = [CORE];
  if (s.strip >= 1) inPlace.push(FLAPS.strip.poly);
  if (s.left >= 1) inPlace.push(FLAPS.left.poly);
  if (s.right >= 1) inPlace.push(FLAPS.right.poly);
  ctx.save();
  // A soft shadow under the paper.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  const base = new Path2D();
  for (const p of inPlace) base.addPath(poly(p));
  ctx.fillStyle = '#d6c6a2';
  ctx.fill(base);
  ctx.restore();
  ctx.save();
  ctx.clip(base);
  ctx.drawImage(art.front, 0, 0, W, H);
  ctx.restore();

  // The flaps still moving or folded, back to front: right lies lowest, then the strip, then the left.
  const flap = (name: FlapName, open: number, clip?: Path2D) => {
    if (open >= 1) return;
    const f = FLAPS[name];
    const m = flipMatrix(f, open);
    const c = Math.cos(Math.PI * (1 - open));
    ctx.save();
    if (clip) ctx.clip(clip);
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    const p = poly(f.poly);
    // A shadow under a lifted flap.
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 8 + 10 * (1 - Math.abs(c));
    ctx.fillStyle = '#d6c6a2';
    ctx.fill(p);
    ctx.restore();
    ctx.clip(p);
    ctx.drawImage(c >= 0 ? art.front : name === 'left' ? art.backLeft : art.back, 0, 0, W, H);
    // Edge-on, the paper catches less light.
    ctx.fillStyle = `${SHADE}${0.32 * (1 - Math.abs(c))})`;
    ctx.fill(p);
    ctx.restore();
  };
  // While the left flap is folded, the right flap's part over the left half goes with it.
  if (s.right < 1) flap('right', s.right, s.left < 1 ? poly(CORE) : undefined);
  // The strip is tucked under the left flap: hidden over the core, seen only below the fold line.
  if (s.strip < 1) {
    const room = new Path2D();
    room.addPath(poly(CORE));
    room.rect(-20, W, W + 40, H);
    flap('strip', s.strip, room);
  }
  if (s.left < 1) flap('left', s.left);
}

/** The bounding box of what is visible at a fold state, for the camera. */
export function bounds(s: FoldState): { x: number; y: number; w: number; h: number } {
  const pts: Pt[] = [...CORE];
  const add = (name: FlapName, open: number, minY = -Infinity) => {
    const m = flipMatrix(FLAPS[name], open);
    for (const p of FLAPS[name].poly) {
      const [x, y] = apply(m, p);
      pts.push([x, Math.max(minY, y)]);
    }
  };
  // The strip shows only below the fold line until it is out; the right flap only over the core while the left is folded.
  add('strip', s.strip, W);
  add('left', s.left);
  if (s.left > 0) add('right', s.right);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}
