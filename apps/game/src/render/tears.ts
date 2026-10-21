/**
 * Geometry of the tears in the poster («Красные очки»), kept free of Pixi so it can be tested.
 * Each hole starts opening at its own point of the game (t from 0 to 1) and grows to its full size by t = 0.9.
 */
import { clamp, seededRng } from '../core/rng.ts';

export interface Hole {
  x: number;
  y: number;
  /** When it starts to open, 0..1. */
  start: number;
  /** Radius at full size, in reference pixels (1280×720). */
  max: number;
}

export const FULL_AT = 0.9;

export function holeRadius(t: number, h: Hole): number {
  const k = clamp((t - h.start) / (FULL_AT - h.start));
  return k > 0 ? h.max * Math.pow(k, 0.85) : 0;
}

/** A torn outline: 30 spokes with uneven lengths and a few long splinters, fixed per seed. */
export function tearShape(seed: number, spokes = 30): number[] {
  const r = seededRng(seed);
  const m: number[] = [];
  for (let i = 0; i < spokes; i++) {
    let v = 0.72 + r() * 0.38;
    if (r() < 0.18) v += 0.25 + r() * 0.3;
    if (r() < 0.12) v -= 0.2;
    m.push(v);
  }
  return m;
}

/** Flat [x0, y0, x1, y1, …] polygon of a hole of radius rad. */
export function tearPoints(h: Hole, rad: number, shape: readonly number[], rot: number): number[] {
  const pts: number[] = [];
  const n = shape.length;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const rr = rad * (shape[i] ?? 1);
    pts.push(h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr * 0.9);
  }
  return pts;
}

/** The lineup: the poster frays at the edges first, the line of soldiers goes last. */
export const LINEUP_HOLES: readonly Hole[] = [
  { x: 1250, y: 400, start: 0.05, max: 120 },
  { x: 30, y: 560, start: 0.08, max: 110 },
  { x: 660, y: 700, start: 0.1, max: 140 },
  { x: 160, y: 110, start: 0.16, max: 660 },
  { x: 1200, y: 690, start: 0.22, max: 660 },
  { x: 1060, y: 210, start: 0.3, max: 320 },
  { x: 880, y: 470, start: 0.32, max: 560 },
  { x: 300, y: 470, start: 0.38, max: 610 },
  { x: 1120, y: 120, start: 0.45, max: 610 },
  { x: 60, y: 690, start: 0.42, max: 530 },
  { x: 640, y: 360, start: 0.6, max: 800 },
];
