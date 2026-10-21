/**
 * The sleeping room of the barracks, top-down, in the 1280×720 frame: walls (block movement, sight, the
 * general's voice, bullets and throws), bunks, the table with the tape recorder and the stove (block
 * movement only), the far door to the general's office. Plus the geometry the fight needs.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pt {
  x: number;
  y: number;
}

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** Inner floor: x 40..1240, y 56..690. The top band (y < 56) is wall; the slogans flash there. */
export const FLOOR = r(40, 56, 1200, 634);

/** The far door to the office, a gap in the top wall that only the general may pass. */
export const DOOR = r(1110, 0, 90, 56);

export const WALLS: Rect[] = [
  r(0, 0, 1110, 56),
  r(1200, 0, 80, 56),
  r(0, 690, 1280, 30),
  r(0, 0, 40, 720),
  r(1240, 0, 40, 720),
  // Partitions: corners to hide behind from the general's voice.
  r(690, 56, 22, 250),
  r(880, 470, 22, 220),
  r(1000, 300, 130, 20),
];

/** Two-tier bunks seen from above. */
export const BUNKS: Rect[] = [
  r(120, 76, 56, 150),
  r(250, 76, 56, 150),
  r(380, 76, 56, 150),
  r(520, 76, 56, 150),
  r(330, 524, 56, 150),
  r(470, 524, 56, 150),
  r(610, 524, 56, 150),
  r(770, 76, 150, 56),
  r(770, 200, 150, 56),
  r(950, 560, 150, 56),
];

export const TABLE = r(520, 330, 120, 66);
export const TAPE: Pt = { x: 580, y: 363 };
export const STOVE = r(1150, 600, 72, 72);

/** What blocks walking (the door only for those who aren't the general). */
export const SOLIDS: Rect[] = [...WALLS, ...BUNKS, TABLE, STOVE];
/** What blocks sight, the voice, bullets and thrown things. */
export const SIGHT: Rect[] = [...WALLS, DOOR];

export const START: Pt = { x: 92, y: 612 };
export const ALLY_START: Pt = { x: 80, y: 540 };
export const GENERAL_START: Pt = { x: 1160, y: 108 };
export const GENERAL_SPOTS: Pt[] = [
  { x: 1160, y: 108 },
  { x: 1060, y: 190 },
  { x: 1190, y: 250 },
  { x: 990, y: 120 },
];
export const EXIT: Pt = { x: 1155, y: -40 };

// ---------- geometry ----------

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const angleTo = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x);

export function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Liang–Barsky: the fraction 0..1 along a→b where the segment first enters rect, or null. */
export function segRect(ax: number, ay: number, bx: number, by: number, rc: Rect): number | null {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - rc.x, rc.x + rc.w - ax, ay - rc.y, rc.y + rc.h - ay];
  for (let i = 0; i < 4; i++) {
    const pi = p[i]!;
    const qi = q[i]!;
    if (pi === 0) {
      if (qi < 0) return null;
    } else {
      const t = qi / pi;
      if (pi < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0;
}

/** First hit of a→b against any of rects, as a fraction 0..1 (1 when clear). */
export function castSeg(a: Pt, b: Pt, rects: readonly Rect[]): number {
  let best = 1;
  for (const rc of rects) {
    const t = segRect(a.x, a.y, b.x, b.y, rc);
    if (t !== null && t < best) best = t;
  }
  return best;
}

export function los(a: Pt, b: Pt, rects: readonly Rect[] = SIGHT): boolean {
  return castSeg(a, b, rects) >= 1;
}

/** Pushes a circle out of a rect; returns true if it moved. */
export function pushOut(p: Pt, rad: number, rc: Rect): boolean {
  const cx = Math.max(rc.x, Math.min(p.x, rc.x + rc.w));
  const cy = Math.max(rc.y, Math.min(p.y, rc.y + rc.h));
  let dx = p.x - cx;
  let dy = p.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rad * rad) return false;
  if (d2 === 0) {
    // Centre inside the rect: leave by the nearest side.
    const left = p.x - rc.x;
    const right = rc.x + rc.w - p.x;
    const top = p.y - rc.y;
    const bottom = rc.y + rc.h - p.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) p.x = rc.x - rad;
    else if (m === right) p.x = rc.x + rc.w + rad;
    else if (m === top) p.y = rc.y - rad;
    else p.y = rc.y + rc.h + rad;
    return true;
  }
  const d = Math.sqrt(d2);
  dx /= d;
  dy /= d;
  p.x = cx + dx * rad;
  p.y = cy + dy * rad;
  return true;
}

export function circleHits(p: Pt, rad: number, rects: readonly Rect[]): boolean {
  for (const rc of rects) {
    const cx = Math.max(rc.x, Math.min(p.x, rc.x + rc.w));
    const cy = Math.max(rc.y, Math.min(p.y, rc.y + rc.h));
    if ((p.x - cx) ** 2 + (p.y - cy) ** 2 < rad * rad) return true;
  }
  return false;
}

/** Can a circle of rad walk straight from a to b? */
export function walkable(a: Pt, b: Pt, rad: number, rects: readonly Rect[] = SOLIDS): boolean {
  const d = dist(a, b);
  const n = Math.ceil(d / 8);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (circleHits({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, rad, rects)) return false;
  }
  return true;
}

/** The area a voice (or a light) at c reaches within radius, cut by walls: a fan of ray ends. */
export function reach(c: Pt, radius: number, rays = 180): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const end = { x: c.x + Math.cos(a) * radius, y: c.y + Math.sin(a) * radius };
    const t = castSeg(c, end, SIGHT);
    pts.push({ x: c.x + (end.x - c.x) * t, y: c.y + (end.y - c.y) * t });
  }
  return pts;
}

// ---------- paths: A* on a 20 px grid ----------

const CELL = 20;
const GW = Math.ceil(1280 / CELL);
const GH = Math.ceil(720 / CELL);

function buildGrid(rad: number): Uint8Array {
  const g = new Uint8Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const p = { x: gx * CELL + CELL / 2, y: gy * CELL + CELL / 2 };
      if (circleHits(p, rad, [...SOLIDS, DOOR])) g[gy * GW + gx] = 1;
    }
  }
  return g;
}

let grid: Uint8Array | null = null;

const cellOf = (p: Pt) => ({ gx: Math.max(0, Math.min(GW - 1, Math.floor(p.x / CELL))), gy: Math.max(0, Math.min(GH - 1, Math.floor(p.y / CELL))) });

/** Nearest free cell to p (agents pressed against a bunk may stand in a blocked cell). */
function freeCell(g: Uint8Array, p: Pt): number {
  const { gx, gy } = cellOf(p);
  if (!g[gy * GW + gx]) return gy * GW + gx;
  for (let rad = 1; rad < 6; rad++) {
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const x = gx + dx;
        const y = gy + dy;
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        if (!g[y * GW + x]) return y * GW + x;
      }
    }
  }
  return gy * GW + gx;
}

/** Waypoints from a to b (excluding a), or [] when there is no way. */
export function findPath(a: Pt, b: Pt): Pt[] {
  grid ??= buildGrid(15);
  const g = grid;
  const start = freeCell(g, a);
  const goal = freeCell(g, b);
  if (start === goal) return [b];
  const n = GW * GH;
  const gScore = new Float32Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open: number[] = [start];
  const f = new Float32Array(n).fill(Infinity);
  gScore[start] = 0;
  const gx1 = goal % GW;
  const gy1 = Math.floor(goal / GW);
  const h = (i: number) => {
    const dx = Math.abs((i % GW) - gx1);
    const dy = Math.abs(Math.floor(i / GW) - gy1);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  f[start] = h(start);
  let guard = 0;
  while (open.length && guard++ < 4000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]!]! < f[open[bi]!]!) bi = i;
    const cur = open[bi]!;
    open.splice(bi, 1);
    if (cur === goal) break;
    closed[cur] = 1;
    const cx = cur % GW;
    const cy = Math.floor(cur / GW);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const ni = ny * GW + nx;
        if (g[ni] || closed[ni]) continue;
        // No cutting corners.
        if (dx && dy && (g[cy * GW + nx] || g[ny * GW + cx])) continue;
        const cost = gScore[cur]! + (dx && dy ? Math.SQRT2 : 1);
        if (cost < gScore[ni]!) {
          gScore[ni] = cost;
          from[ni] = cur;
          f[ni] = cost + h(ni);
          if (!open.includes(ni)) open.push(ni);
        }
      }
    }
  }
  if (from[goal] === -1) return [];
  const cells: number[] = [];
  for (let c = goal; c !== start && c !== -1; c = from[c]!) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => ({ x: (c % GW) * CELL + CELL / 2, y: Math.floor(c / GW) * CELL + CELL / 2 }));
  pts[pts.length - 1] = b;
  return pts;
}
