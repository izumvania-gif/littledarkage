/**
 * The smell haze: the only picture the blind striker has. Grains around the centre of the screen
 * (the top is always «where I look»), dense where something smells. Unsniffed it gives a wide, soft
 * direction and strength; sniffed it narrows to a clear direction and a distance. Never a shape.
 */

/** One smell source in screen terms: angle (0 = right, -π/2 = ahead), radius in reference px, strength 0..1+. */
export interface Whiff {
  phi: number;
  r: number;
  amp: number;
  strong: boolean;
}

interface Grain {
  phi: number;
  r: number;
  size: number;
  phase: number;
  speed: number;
}

const R_MIN = 34;
const R_MAX = 300;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function angleGap(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export class Haze {
  private grains: Grain[] = [];

  constructor(count = 1600) {
    for (let i = 0; i < count; i++) this.grains.push(this.spawn());
  }

  private spawn(): Grain {
    // Area-uniform radius, so the haze is not crowded at the centre.
    const u = Math.random();
    return {
      phi: Math.random() * Math.PI * 2,
      r: Math.sqrt(lerp(R_MIN * R_MIN, R_MAX * R_MAX, u)),
      size: 1.1 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      speed: 1.5 + Math.random() * 3,
    };
  }

  /** sharp 0..1: 0 is the plain haze, 1 just after «нюхай». */
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, whiffs: readonly Whiff[], sharp: number, t: number): void {
    const sPhi = lerp(0.85, 0.24, sharp);
    const sR = lerp(150, 30, sharp);
    const gain = lerp(0.5, 1, sharp);

    // Soft clouds under the grain, one per source.
    for (const w of whiffs) {
      const rc = lerp(140, w.r, sharp);
      const x = cx + Math.cos(w.phi) * rc;
      const y = cy + Math.sin(w.phi) * rc;
      const rad = lerp(190, 70, sharp);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const a = Math.min(0.16, 0.09 * w.amp * gain + 0.03 * sharp);
      g.addColorStop(0, w.strong && sharp > 0.5 ? `rgba(150, 168, 118, ${a})` : `rgba(216, 203, 176, ${a})`);
      g.addColorStop(1, 'rgba(216, 203, 176, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }

    // Grains: each one's brightness is the smell density where it sits, flickering.
    for (let i = 0; i < this.grains.length; i++) {
      let g = this.grains[i]!;
      if (Math.random() < 0.03) g = this.grains[i] = this.spawn();
      let d = 0.03;
      let strong = 0;
      for (const w of whiffs) {
        const rc = lerp(140, w.r, sharp);
        const da = angleGap(g.phi, w.phi);
        const k = w.amp * gain * Math.exp(-(da * da) / (2 * sPhi * sPhi)) * Math.exp(-((g.r - rc) ** 2) / (2 * sR * sR));
        d += k;
        if (w.strong) strong += k;
      }
      const flicker = 0.55 + 0.45 * Math.sin(g.phase + t * g.speed);
      const a = Math.min(0.9, d * flicker);
      if (a < 0.02) continue;
      const coarse = strong > d * 0.5 && sharp > 0.5;
      ctx.fillStyle = coarse ? `rgba(160, 178, 128, ${a})` : `rgba(222, 210, 184, ${a})`;
      const s = coarse ? g.size * 1.7 : g.size;
      ctx.fillRect(cx + Math.cos(g.phi) * g.r, cy + Math.sin(g.phi) * g.r, s, s);
    }
  }
}
