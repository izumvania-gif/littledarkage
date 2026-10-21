/**
 * Where things are on screen in the coordinator's view: the tunnel «сверху и чуть наискось» (far rows
 * narrower and higher), the coordinators' zone along the near edge with the red lamp in it, and the shapes
 * every layer is cut from. Pure numbers and Pixi paths, the same for the poster and the truth.
 */
import type { Graphics } from 'pixi.js';
import { seededRng } from '../../../core/rng.ts';
import { SIZE, type Dir } from '../../../core/battle.ts';

/** The field's centre line; the panel takes the right of the frame, ROSTA lettering the left. */
export const CX = 600;
const TOP = 52;
const CELL_H = 61;
const CELL_W = 64;
const FAR = 0.62;
const K = 0.38;

const scaleAt = (u: number) => FAR + (K * u) / SIZE;
const yAt = (u: number) => TOP + CELL_H * (FAR * u + (K * u * u) / (2 * SIZE));

export const FIELD_TOP = TOP;
export const FIELD_BOTTOM = yAt(SIZE);

/** Centre of cell (x, y) on screen, with the perspective scale there. */
export function pt(x: number, y: number): { x: number; y: number; s: number } {
  const u = y + 0.5;
  const s = scaleAt(u);
  return { x: CX + (x - 4) * CELL_W * s, y: yAt(u), s };
}

/** A corner of the grid: gx a column edge (-0.5 … 8.5), u a row edge (0 … 9). */
export function edge(gx: number, u: number): { x: number; y: number } {
  return { x: CX + (gx - 4) * CELL_W * scaleAt(u), y: yAt(u) };
}

/** The field's outline as a flat polygon: far left, far right, near right, near left. */
export function fieldOutline(): number[] {
  const a = edge(-0.5, 0);
  const b = edge(8.5, 0);
  const c = edge(8.5, SIZE);
  const d = edge(-0.5, SIZE);
  return [a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y];
}

/** The zone: coordinators stand behind the parapet in front of their pairs; the player is the camera. */
export const ZONE_Y = 640;
export const zoneX = (col: number) => CX + (col - 4) * CELL_W * 1.25;

/** The red lamp hangs over the parapet at the middle of the zone, between the coordinators. */
export const LAMP = { x: CX, y: FIELD_BOTTOM + 42 };

/** Rats are drawn this much larger than one unit per pixel at the near row. */
export const RAT = 2.5;

export const ANGLE: Record<Dir, number> = { 0: -Math.PI / 2, 1: 0, 2: Math.PI / 2, 3: Math.PI };

/** Where a cell is heard from, for the player standing at the middle of the zone and facing the field. */
export function heardAt(x: number, y: number): { x: number; z: number } {
  return { x: x - 4, z: SIZE - y };
}

// ---------- the cut-outs (from docs/red-glasses.html, top-down rat facing +x) ----------

/** A rat from above: body, snout and ears. Local units, nose toward +x. */
export function ratBody(g: Graphics, color: number, alpha = 1): Graphics {
  g.ellipse(0, 0, 9, 6).fill({ color, alpha });
  g.moveTo(17, 0).quadraticCurveTo(12, -5.2, 6, -4.6).quadraticCurveTo(3, 0, 6, 4.6).quadraticCurveTo(12, 5.2, 17, 0).closePath().fill({ color, alpha });
  g.circle(6.5, -5.6, 2.6).fill({ color, alpha });
  g.circle(6.5, 5.6, 2.6).fill({ color, alpha });
  return g;
}

export function ratTail(g: Graphics, color: number, width = 2.2): Graphics {
  return g.moveTo(-8.5, 0).quadraticCurveTo(-18, 7, -26, -1).stroke({ width, color, cap: 'round' });
}

/** The blindfold across the head and its knot at the back: the knot shows where the head looks from. */
export function blindfold(g: Graphics, color: number): Graphics {
  g.rect(9, -5.2, 2.8, 10.4).fill(color);
  return g.moveTo(9.4, -4.8).lineTo(4.2, -8.8).lineTo(6.6, -4.2).closePath().fill(color);
}

/** A creature: a pale sheet of paper with a torn edge. Same shape for a given id in every flash and layer. */
export function sheetPoints(id: number): number[] {
  const r = seededRng(id * 7919 + 13);
  const rot = (r() - 0.5) * 0.7;
  const base: [number, number][] = [
    [-24, -17],
    [-8, -19],
    [9, -18],
    [25, -16],
    [26, 0],
    [24, 17],
    [6, 18],
    [-10, 17],
    [-25, 16],
    [-26, 0],
  ];
  const out: number[] = [];
  for (const [x0, y0] of base) {
    const x = x0 + (r() - 0.5) * 7;
    const y = y0 + (r() - 0.5) * 7;
    out.push(x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot));
  }
  return out;
}

/** A crushed creature: a crumpled ball of the same paper, left where it died. */
export function crumplePoints(id: number): number[] {
  const r = seededRng(id * 104729 + 7);
  const out: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const rad = 13 * (0.6 + r() * 0.5);
    out.push(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  return out;
}

/** A secret: a small folded soldier's triangle, lost in the dark. */
export const TRIANGLE = [-12, 7, 12, 7, 0, -9];

/** Ragged-edged ray wedges of the poster's lamp, fanning up over the field. */
export function rayWedges(): number[][] {
  const out: number[][] = [];
  const n = 9;
  for (let i = 0; i < n; i += 2) {
    const a0 = -Math.PI + 0.32 + (i * (Math.PI - 0.64)) / n;
    const a1 = a0 + (Math.PI - 0.64) / n;
    const far = 900;
    out.push([LAMP.x, LAMP.y, LAMP.x + Math.cos(a0) * far, LAMP.y + Math.sin(a0) * far, LAMP.x + Math.cos(a1) * far, LAMP.y + Math.sin(a1) * far]);
  }
  return out;
}
