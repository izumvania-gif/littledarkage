/**
 * The tunnel seen from the coordinators' zone, «сверху и чуть наискось»: far rows narrower and higher.
 * Everything here is drawn at full lamp light into a snapshot; main.ts fades that snapshot between flashes.
 */
import { rng, SIZE, type Battle, type Dir, type Striker } from '../shared/sim.ts';

export const CX = 560;
const TOP = 52;
const CELL_H = 61;
const CELL_W = 64;
const FAR = 0.62;
const K = 0.38;

export const LAMP = { x: CX, y: 22 };

const scaleAt = (u: number) => FAR + (K * u) / SIZE;
const yAt = (u: number) => TOP + CELL_H * (FAR * u + (K * u * u) / (2 * SIZE));
export const FIELD_BOTTOM = yAt(SIZE);

/** Centre of cell (x, y) on screen, with the perspective scale there. */
export function pt(x: number, y: number): { x: number; y: number; s: number } {
  const u = y + 0.5;
  const s = scaleAt(u);
  return { x: CX + (x - 4) * CELL_W * s, y: yAt(u), s };
}

/** A corner of the grid: gx is a column edge (-0.5 … 8.5), u a row edge (0 … 9). */
function edge(gx: number, u: number): { x: number; y: number } {
  return { x: CX + (gx - 4) * CELL_W * scaleAt(u), y: yAt(u) };
}

/** The other coordinators stand in the zone in front of their pairs; the player is the camera. */
export const ZONE_Y = 628;
export const zoneX = (col: number) => CX + (col - 4) * CELL_W * 1.25;

/** Rats are drawn this much larger than one unit per pixel at the near row. */
const RAT = 1.3;

const ANGLE: Record<Dir, number> = { 0: -Math.PI / 2, 1: 0, 2: Math.PI / 2, 3: Math.PI };

export interface Crushed {
  x: number;
  y: number;
  id: number;
  strong: boolean;
}

export interface Snap {
  b: Battle;
  crushed: Crushed[];
  /** Норкин trembles: he was hit last turn. */
  scared: boolean;
  player: number;
  /** Columns of the other coordinators in the zone. */
  coords: number[];
}

// Floor grit is the same in every snapshot, so it is generated once.
const GRIT = (() => {
  const r = rng(424242);
  return Array.from({ length: 520 }, () => ({ gx: -0.5 + r() * SIZE, u: r() * SIZE, light: r() < 0.3, size: 0.6 + r() * 1.6 }));
})();

export function renderSnapshot(ctx: CanvasRenderingContext2D, snap: Snap): void {
  drawTunnel(ctx);
  const { b } = snap;
  for (const t of b.traps) if (t.sprung) chalkCross(ctx, t.x, t.y);
  for (const c of snap.crushed) crumpled(ctx, c);
  const items: { y: number; draw: () => void }[] = [];
  for (const s of b.secrets) if (!s.taken) items.push({ y: s.y, draw: () => secret(ctx, s.x, s.y, s.x * 31 + s.y) });
  for (const c of b.creatures) if (c.alive) items.push({ y: c.y - 0.1, draw: () => sheet(ctx, c.x, c.y, c.id, c.strong) });
  for (const s of b.strikers) items.push({ y: s.y + 0.1, draw: () => rat(ctx, s, s.id === snap.player && snap.scared) });
  items.sort((a, z) => a.y - z.y);
  for (const it of items) it.draw();
  drawZone(ctx, snap.coords);
}

function drawTunnel(ctx: CanvasRenderingContext2D): void {
  // Walls and ceiling around the field: soot, lit only near the lamp.
  const wall = ctx.createRadialGradient(LAMP.x, LAMP.y + 60, 20, LAMP.x, LAMP.y + 160, 640);
  wall.addColorStop(0, '#3a1410');
  wall.addColorStop(0.5, '#1c0a08');
  wall.addColorStop(1, '#070303');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, 900, FIELD_BOTTOM + 4);
  // Timber props along the tunnel walls.
  for (const side of [-1, 1]) {
    for (let u = 0.5; u < SIZE; u += 2.2) {
      const a = edge(4 + side * 4.5, u);
      const s = scaleAt(u);
      const x = a.x + side * 14 * s;
      ctx.fillStyle = '#120706';
      ctx.fillRect(x - 5 * s, a.y - 120 * s, 10 * s, 120 * s);
      ctx.fillStyle = 'rgba(214, 72, 52, 0.18)';
      ctx.fillRect(x - side * 5 * s, a.y - 120 * s, 1.5, 120 * s);
    }
  }
  // Floor.
  const p0 = edge(-0.5, 0);
  const p1 = edge(8.5, 0);
  const p2 = edge(8.5, SIZE);
  const p3 = edge(-0.5, SIZE);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.closePath();
  const floor = ctx.createRadialGradient(LAMP.x, LAMP.y + 170, 30, LAMP.x, LAMP.y + 240, 560);
  floor.addColorStop(0, '#6a2a20');
  floor.addColorStop(0.5, '#43190f');
  floor.addColorStop(1, '#1f0c09');
  ctx.fillStyle = floor;
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (const g of GRIT) {
    const p = edge(g.gx, g.u);
    const s = scaleAt(g.u);
    ctx.fillStyle = g.light ? 'rgba(255, 190, 170, 0.07)' : 'rgba(0, 0, 0, 0.32)';
    ctx.fillRect(p.x, p.y, g.size * s * 1.6, g.size * s);
  }
  ctx.restore();
  // Faint chalk grid: the field was marked out, so cells can be counted in a flash.
  ctx.strokeStyle = 'rgba(234, 223, 198, 0.11)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = -0.5; gx <= 8.5; gx += 1) {
    const a = edge(gx, 0);
    const z = edge(gx, SIZE);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(z.x, z.y);
  }
  for (let u = 0; u <= SIZE; u += 1) {
    const a = edge(-0.5, u);
    const z = edge(8.5, u);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(z.x, z.y);
  }
  ctx.stroke();
}

function drawZone(ctx: CanvasRenderingContext2D, coords: number[]): void {
  const l = edge(-0.5, SIZE).x - 40;
  const r = edge(8.5, SIZE).x + 40;
  // The zone floor and the parapet (бруствер) in front of the player.
  ctx.fillStyle = '#0a0606';
  ctx.fillRect(0, FIELD_BOTTOM + 2, 900, 720 - FIELD_BOTTOM);
  ctx.fillStyle = '#170d0b';
  ctx.fillRect(l, FIELD_BOTTOM + 2, r - l, 34);
  ctx.fillStyle = 'rgba(214, 72, 52, 0.45)';
  ctx.fillRect(l, FIELD_BOTTOM + 2, r - l, 2);
  for (const col of coords) headFromBehind(ctx, zoneX(col), ZONE_Y);
}

function headFromBehind(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#060404';
  ctx.beginPath();
  ctx.ellipse(x, y + 78, 96, 52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y, 40, 36, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 34, y - 26, 15, 18, -0.4, 0, Math.PI * 2);
  ctx.ellipse(x + 34, y - 26, 15, 18, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(214, 72, 52, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, 40, 36, 0, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
}

/** A creature: a pale flat sheet of paper with a torn edge, lying on the floor. */
function sheet(ctx: CanvasRenderingContext2D, x: number, y: number, id: number, strong: boolean): void {
  const p = pt(x, y);
  const r = rng(id * 7919 + 13);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.s, p.s * 0.6);
  ctx.rotate((r() - 0.5) * 0.7);
  const path = raggedRect(r, 52, 38);
  ctx.save();
  ctx.translate(3, 6);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fill(path);
  ctx.restore();
  ctx.fillStyle = '#efdccd';
  ctx.fill(path);
  ctx.strokeStyle = 'rgba(110, 50, 40, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke(path);
  ctx.strokeStyle = 'rgba(110, 50, 40, 0.25)';
  ctx.beginPath();
  ctx.moveTo(-20, (r() - 0.5) * 10);
  ctx.lineTo(20, (r() - 0.5) * 10);
  ctx.stroke();
  if (strong) {
    ctx.strokeStyle = '#1c1a18';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-13, -10);
    ctx.lineTo(13, 10);
    ctx.moveTo(13, -10);
    ctx.lineTo(-13, 10);
    ctx.stroke();
  }
  ctx.restore();
}

function raggedRect(r: () => number, w: number, h: number): Path2D {
  const path = new Path2D();
  const corners: [number, number][] = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
  corners.forEach(([ax, ay], i) => {
    const [bx, by] = corners[(i + 1) % 4]!;
    for (let k = 0; k < 6; k++) {
      const t = k / 6;
      const nx = -(by - ay);
      const ny = bx - ax;
      const len = Math.hypot(nx, ny);
      const j = (r() - 0.5) * 3.2;
      const x = ax + (bx - ax) * t + (nx / len) * j + (k === 0 ? (r() - 0.5) * 3 : 0);
      const y = ay + (by - ay) * t + (ny / len) * j + (k === 0 ? (r() - 0.5) * 3 : 0);
      if (i === 0 && k === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
  });
  path.closePath();
  return path;
}

/** A crushed creature: a crumpled ball of the same paper, left where it died. */
function crumpled(ctx: CanvasRenderingContext2D, c: Crushed): void {
  const p = pt(c.x, c.y);
  const r = rng(c.id * 104729 + 7);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.s, p.s * 0.72);
  const path = new Path2D();
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = 13 * (0.6 + r() * 0.5);
    if (i === 0) path.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    else path.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  path.closePath();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.translate(2, 4);
  ctx.fill(path);
  ctx.translate(-2, -4);
  ctx.fillStyle = '#a99486';
  ctx.fill(path);
  ctx.strokeStyle = 'rgba(40, 20, 16, 0.6)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    ctx.moveTo((r() - 0.5) * 16, (r() - 0.5) * 16);
    ctx.lineTo((r() - 0.5) * 16, (r() - 0.5) * 16);
  }
  ctx.stroke();
  if (c.strong) {
    ctx.strokeStyle = 'rgba(28, 26, 24, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-5, -4);
    ctx.lineTo(5, 4);
    ctx.stroke();
  }
  ctx.restore();
}

/** A secret: a small folded soldier's triangle someone lost in the dark. */
function secret(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number): void {
  const p = pt(x, y);
  const r = rng(seed + 99);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.s, p.s * 0.7);
  ctx.rotate((r() - 0.5) * 1.2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  tri(ctx, 2, 4);
  ctx.fillStyle = '#f1e4c8';
  tri(ctx, 0, 0);
  ctx.strokeStyle = 'rgba(80, 40, 30, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-11, 7);
  ctx.lineTo(0, -1);
  ctx.lineTo(11, 7);
  ctx.moveTo(0, -1);
  ctx.lineTo(0, -8);
  ctx.stroke();
  ctx.restore();
}

function tri(ctx: CanvasRenderingContext2D, dx: number, dy: number): void {
  ctx.beginPath();
  ctx.moveTo(-12 + dx, 7 + dy);
  ctx.lineTo(12 + dx, 7 + dy);
  ctx.lineTo(dx, -9 + dy);
  ctx.closePath();
  ctx.fill();
}

/** A sprung trap: a chalk cross on the floor. */
function chalkCross(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const p = pt(x, y);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.s, p.s * 0.6);
  ctx.lineCap = 'round';
  for (const [o, a, w] of [
    [0, 0.85, 3.4],
    [1.5, 0.35, 2],
  ] as const) {
    ctx.strokeStyle = `rgba(240, 234, 220, ${a})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(-15 + o, -15);
    ctx.lineTo(15 + o, 14);
    ctx.moveTo(15 - o, -14);
    ctx.lineTo(-14 - o, 15);
    ctx.stroke();
  }
  ctx.restore();
}

/** A striker from above: black silhouette, the bandage across the eyes, its white knot on the back of the head. */
function rat(ctx: CanvasRenderingContext2D, s: Striker, trembling: boolean): void {
  const p = pt(s.x, s.y);
  ctx.save();
  ctx.translate(p.x, p.y - 3 * p.s);
  ctx.scale(p.s * RAT, p.s * RAT * 0.78);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.ellipse(0, 6, 28, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!s.alive) {
    // Lying on its side, the bandage slipped off.
    ctx.rotate(ANGLE[s.dir] + 0.6);
    ctx.scale(1, 0.7);
    ratBody(ctx, 'rgba(11, 9, 8, 0.85)');
    ctx.strokeStyle = 'rgba(238, 228, 208, 0.7)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(30, 10);
    ctx.quadraticCurveTo(38, 2, 44, 12);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.rotate(ANGLE[s.dir]);
  ratBody(ctx, '#0b0908');
  ctx.strokeStyle = 'rgba(214, 72, 52, 0.6)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(-4, 0, 21, 14, 0, 0, Math.PI * 2);
  ctx.moveTo(26, 0);
  ctx.ellipse(15, 0, 11, 9.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Bandage across the eyes.
  ctx.strokeStyle = '#eee4d0';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(19, -9.6);
  ctx.lineTo(19, 9.6);
  ctx.stroke();
  // The knot on the back of the head: the head looks the other way.
  ctx.fillStyle = '#f5ecda';
  ctx.beginPath();
  ctx.ellipse(5, -3.6, 3.6, 2.4, -0.5, 0, Math.PI * 2);
  ctx.ellipse(5, 3.6, 3.6, 2.4, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f5ecda';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(-5, -5);
  ctx.moveTo(5, 0);
  ctx.lineTo(-5, 4);
  ctx.stroke();
  ctx.restore();
  if (trembling) {
    // Tremble marks: he flinched when he was hit.
    ctx.strokeStyle = 'rgba(240, 230, 210, 0.85)';
    ctx.lineWidth = 1.6;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(p.x + side * (24 + i * 6) * RAT * p.s, p.y - 4 * p.s, (6 + i * 3) * p.s, side > 0 ? -0.9 : Math.PI - 0.9, side > 0 ? 0.9 : Math.PI + 0.9);
        ctx.stroke();
      }
    }
  }
}

function ratBody(ctx: CanvasRenderingContext2D, fill: string): void {
  ctx.strokeStyle = fill;
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.quadraticCurveTo(-38, 12, -52, 2);
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(-4, 0, 21, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(15, 0, 11, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(22, -5.5);
  ctx.lineTo(32, 0);
  ctx.lineTo(22, 5.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(10, -10.5, 5.5, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(10, 10.5, 5.5, 5, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** The red lamp over the field: an ember between flashes, a burst at each. Drawn live every frame. */
export function drawLamp(ctx: CanvasRenderingContext2D, bright: number, glare: number): void {
  ctx.strokeStyle = '#1a0d0b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LAMP.x, 0);
  ctx.lineTo(LAMP.x, LAMP.y - 8);
  ctx.stroke();
  ctx.fillStyle = '#140908';
  ctx.beginPath();
  ctx.moveTo(LAMP.x - 11, LAMP.y - 8);
  ctx.lineTo(LAMP.x + 11, LAMP.y - 8);
  ctx.lineTo(LAMP.x + 18, LAMP.y);
  ctx.lineTo(LAMP.x - 18, LAMP.y);
  ctx.closePath();
  ctx.fill();
  const k = Math.max(0.12, bright);
  ctx.fillStyle = `rgb(${Math.round(60 + 195 * k)}, ${Math.round(14 + 70 * k * k)}, ${Math.round(10 + 50 * k * k)})`;
  ctx.beginPath();
  ctx.arc(LAMP.x, LAMP.y + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(LAMP.x, LAMP.y + 4, 2, LAMP.x, LAMP.y + 4, 30 + 70 * bright);
  halo.addColorStop(0, `rgba(255, 80, 60, ${0.15 + 0.5 * bright})`);
  halo.addColorStop(1, 'rgba(255, 60, 40, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(LAMP.x - 110, 0, 220, 130);
  if (glare > 0.01) {
    // The burst itself: a brief red wash over the tunnel.
    const wash = ctx.createRadialGradient(LAMP.x, LAMP.y + 120, 20, LAMP.x, LAMP.y + 200, 620);
    wash.addColorStop(0, `rgba(198, 47, 36, ${0.24 * glare})`);
    wash.addColorStop(1, `rgba(198, 47, 36, ${0.05 * glare})`);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, 900, FIELD_BOTTOM + 40);
  }
  ctx.restore();
}

/** The player's hits: chalk strokes on the parapet in front of them, wiped when a hit is taken. */
export function drawTallies(ctx: CanvasRenderingContext2D, hp: number, bright: number): void {
  const x0 = CX - 26;
  const y0 = FIELD_BOTTOM + 8;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * 18;
    if (i < hp) {
      ctx.strokeStyle = `rgba(238, 232, 216, ${0.55 + 0.45 * bright})`;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x + 2, y0 + 22);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(238, 232, 216, ${0.12 + 0.12 * bright})`;
      ctx.fillRect(x - 6, y0 + 6, 14, 10);
    }
  }
  ctx.restore();
}

/** ?debug: the true field, traps included, drawn faintly over everything. */
export function drawTruth(ctx: CanvasRenderingContext2D, b: Battle): void {
  ctx.save();
  ctx.lineWidth = 2;
  for (const t of b.traps) {
    if (t.sprung) continue;
    const p = pt(t.x, t.y);
    ctx.strokeStyle = t.kind === 'snare' ? 'rgba(220, 200, 90, 0.7)' : t.kind === 'pit' ? 'rgba(90, 170, 220, 0.7)' : 'rgba(230, 110, 90, 0.7)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10 * p.s, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const c of b.creatures) {
    if (!c.alive) continue;
    const p = pt(c.x, c.y);
    ctx.strokeStyle = 'rgba(240, 230, 210, 0.55)';
    ctx.strokeRect(p.x - 18 * p.s, p.y - 10 * p.s, 36 * p.s, 20 * p.s);
  }
  for (const s of b.strikers) {
    if (!s.alive) continue;
    const p = pt(s.x, s.y);
    ctx.strokeStyle = 'rgba(120, 220, 140, 0.6)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16 * p.s, 0, Math.PI * 2);
    ctx.moveTo(p.x, p.y);
    const a = ANGLE[s.dir];
    ctx.lineTo(p.x + Math.cos(a) * 22 * p.s, p.y + Math.sin(a) * 22 * p.s * 0.78);
    ctx.stroke();
  }
  ctx.restore();
}
