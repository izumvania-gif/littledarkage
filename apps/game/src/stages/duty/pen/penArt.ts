/**
 * The pen and the hand as cut-outs, seen from above, in three prints: the ROSTA poster (black, red, cream,
 * the barrel printed a little off register), the truth (a cheap blue barrel, chrome, an ivory button) and the
 * blurred shadow. Each part is drawn about its middle, lying along x; the pen is put together from them.
 */
import { Container, Graphics } from 'pixi.js';
import { POSTER } from '../../../render/palette.ts';
import type { PartId } from './penModel.ts';

export type Print = 'poster' | 'truth' | 'shadow';

/** Length and thickness of each part, and where its middle sits along the pen (0 = the button's end). */
export const DIMS: Readonly<Record<PartId, { len: number; r: number; center: number }>> = {
  button: { len: 60, r: 11, center: 30 },
  body: { len: 426, r: 20, center: 257 },
  tip: { len: 120, r: 20, center: 530 },
  refill: { len: 552, r: 5, center: 336 },
  spring: { len: 60, r: 8, center: 530 },
};
/** The refill sits this much further back until the button is clicked. */
export const RETRACT = 26;
/** How much of each part shows on the assembled pen, along it: what the hand can reach. */
export const EXPOSED: Readonly<Record<PartId, [number, number]>> = {
  button: [0, 44],
  body: [44, 470],
  tip: [470, 590],
  refill: [470, 612],
  spring: [500, 560],
};

const T = {
  barrel: 0x1f2b3d,
  shine: 0x5d6f8c,
  chrome: 0xb9bab2,
  ivory: 0xd9d2c2,
  metal: 0x9a968a,
  tube: 0xc9d2d8,
  ink: 0x2c47a0,
  brass: 0xa08a52,
  steel: 0xa6a69e,
  line: 0x15120f,
};

/** One part in one print, centred on its middle. */
export function drawPart(part: PartId, print: Print): Container {
  const c = new Container();
  const p = print === 'poster';
  const s = print === 'shadow';
  const dark = s ? 0x000000 : p ? POSTER.black : T.line;
  const g = new Graphics();
  switch (part) {
    case 'body': {
      if (p) {
        // The off-register red under the black barrel.
        const red = new Graphics().roundRect(-213, -20, 426, 40, 7).fill(POSTER.red);
        red.position.set(5, 4);
        c.addChild(red);
      }
      g.roundRect(-213, -20, 426, 40, 7).fill(s ? 0x000000 : p ? POSTER.black : T.barrel);
      if (!s) {
        g.rect(-200, -13, 392, 4).fill({ color: p ? POSTER.cream : T.shine, alpha: p ? 1 : 0.7 });
        // Grip rings toward the tip end.
        for (let i = 0; i < 6; i++) g.rect(120 + i * 12, -20, 3, 40).fill({ color: p ? POSTER.cream : 0x0f1520, alpha: p ? 0.9 : 0.8 });
      }
      // The clip, lying along the top.
      g.roundRect(-190, -33, 182, 9, 3).fill(s ? 0x000000 : p ? POSTER.cream : T.chrome);
      g.roundRect(-196, -34, 22, 14, 4).fill(s ? 0x000000 : p ? POSTER.cream : T.chrome);
      if (p) g.roundRect(-190, -33, 182, 9, 3).stroke({ width: 3, color: POSTER.black });
      break;
    }
    case 'button':
      g.roundRect(-30, -11, 60, 22, 9).fill(s ? 0x000000 : p ? POSTER.red : T.ivory);
      if (!s) g.roundRect(-30, -11, 60, 22, 9).stroke({ width: p ? 4 : 1.5, color: dark, alpha: p ? 1 : 0.5 });
      if (!s) g.rect(-8, -11, 3, 22).fill({ color: dark, alpha: p ? 1 : 0.4 });
      break;
    case 'tip': {
      const cone = [-60, -20, 38, -9, 60, -5, 60, 5, 38, 9, -60, 20];
      g.poly(cone).fill(s ? 0x000000 : p ? POSTER.red : T.metal);
      if (!s) {
        g.poly(cone).stroke({ width: p ? 4 : 1.5, color: dark, alpha: p ? 1 : 0.5 });
        for (let i = 0; i < 4; i++) g.rect(-58 + i * 5, -20, 2, 40).fill({ color: dark, alpha: p ? 1 : 0.55 });
        if (!p) g.poly([-40, -14, 30, -7, 30, -4, -40, -9]).fill({ color: 0xe4e2da, alpha: 0.5 });
      }
      break;
    }
    case 'refill':
      g.rect(-276, -4.5, 520, 9).fill(s ? 0x000000 : p ? POSTER.cream : { color: T.tube, alpha: 0.9 });
      if (!s && !p) g.rect(-276, -2.5, 300, 5).fill(T.ink);
      if (p) g.rect(-276, -4.5, 520, 9).stroke({ width: 3, color: POSTER.black });
      g.rect(244, -3.5, 22, 7).fill(s ? 0x000000 : p ? POSTER.black : T.brass);
      g.circle(272, 0, 3.4).fill(s ? 0x000000 : p ? POSTER.black : 0x77746c);
      break;
    case 'spring': {
      g.moveTo(-30, 0);
      for (let i = 0; i <= 12; i++) g.lineTo(-30 + i * 5, i % 2 ? -7 : 7);
      // Red in the poster: it has to show on the black floor where it lands.
      g.stroke({ width: p ? 3.5 : 2, color: s ? 0x000000 : p ? POSTER.red : T.steel, join: 'round' });
      break;
    }
  }
  c.addChild(g);
  return c;
}

/**
 * A rat's paw from above, fingers pointing up (−y), the wrist at (0, 24). `curl` 0..1 closes the fingers.
 * The outline print is what a blindfolded player still knows: where his own hand is.
 */
export function drawPaw(g: Graphics, print: Print | 'outline', curl: number): void {
  g.clear();
  const line = print === 'poster' ? POSTER.black : print === 'outline' ? POSTER.cream : print === 'shadow' ? 0x000000 : 0x4a3d37;
  const fill = print === 'poster' ? POSTER.cream : print === 'shadow' ? 0x000000 : 0xb09891;
  const finger = print === 'truth' ? 0xbea59d : fill;
  const len = 20 - 9 * curl;
  const strokeIt = print === 'poster' || print === 'outline';
  const style = { width: print === 'outline' ? 2 : 3, color: line, alpha: print === 'outline' ? 0.42 : 1 };
  // Fingers and the thumb as round-capped strokes: an ink rim first in the poster, the fill over it.
  const fingers: [number, number, number, number][] = [-0.48, -0.16, 0.16, 0.48].map((a) => {
    const fx = Math.sin(a) * 15;
    const fy = -Math.cos(a) * 15;
    return [fx, fy, fx + Math.sin(a) * len, fy - Math.cos(a) * len];
  });
  fingers.push([-14, 4, -26 + 6 * curl, -6 + 4 * curl]);
  for (const [ax, ay, bx, by] of fingers) {
    if (strokeIt) g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: print === 'outline' ? 11 : 14, color: line, cap: 'round', alpha: style.alpha });
    if (print !== 'outline') g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 8, color: finger, cap: 'round' });
    else g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 7, color: 0x050505, cap: 'round' });
  }
  for (const [ax, ay, bx, by] of fingers.slice(0, 4)) {
    const k = 3 / Math.max(1, Math.hypot(bx - ax, by - ay));
    if (print !== 'outline') g.circle(bx + (bx - ax) * k, by + (by - ay) * k, 1.8).fill(print === 'shadow' ? 0x000000 : 0x2b2420);
  }
  if (print === 'outline') g.ellipse(0, 4, 19, 21).fill(0x050505).stroke(style);
  else {
    g.ellipse(0, 4, 19, 21).fill(fill);
    if (strokeIt) g.ellipse(0, 4, 19, 21).stroke(style);
  }
}

/** The sleeve from the bottom edge of the table to the wrist, with a cuff. */
export function drawSleeve(g: Graphics, print: Print, from: [number, number], to: [number, number]): void {
  g.clear();
  const color = print === 'poster' ? POSTER.black : print === 'shadow' ? 0x000000 : 0x4b4a37;
  g.moveTo(from[0], from[1]).lineTo(to[0], to[1]).stroke({ width: 38, color, cap: 'round' });
  const a = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const cx = to[0] - Math.cos(a) * 10;
  const cy = to[1] - Math.sin(a) * 10;
  const nx = -Math.sin(a) * 19;
  const ny = Math.cos(a) * 19;
  if (print !== 'shadow') g.moveTo(cx + nx, cy + ny).lineTo(cx - nx, cy - ny).stroke({ width: 5, color: print === 'poster' ? POSTER.red : 0x35342a });
}
