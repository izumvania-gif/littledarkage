/**
 * The smell haze: the only picture a blind striker has (concept «Стиль»: «почти полная чернота, только
 * зернистая дымка запаха»). Grains around the centre of the frame — the top is always «where I look» —
 * glow where something smells. Plain, the haze gives a wide, soft direction and strength; after «нюхай» it
 * narrows to a clear direction and distance. Never a shape. One particle container of tiny grains plus a
 * soft cloud per smell, so it costs next to nothing on integrated graphics.
 *
 * With «Подсказки слепого режима» the haze gives way to clear sectors (concept «Доступность»): eight directions
 * by three distances around the head, the top always ahead. Plain, a whole wedge lights up — the direction is
 * known, not the distance; after «нюхай» only the cell where the smell is.
 */
import { Container, Graphics, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js';
import type { Scent } from '../../../core/battle.ts';
import { AHEAD, RINGS, sectorCells, WEDGE, WEDGES } from './sectors.ts';

/** Reference pixels per cell of the field. */
export const CELL = 105;

const GRAINS = 1500;
const R_MIN = 34;
const R_MAX = 300;
const DUST = 0xded2b8;
const STRONG = 0xa0b280;


interface Grain {
  p: Particle;
  phi: number;
  r: number;
  phase: number;
  speed: number;
}

interface Whiff {
  phi: number;
  r: number;
  amp: number;
  strong: boolean;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function gap(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function canvasTexture(size: number, paint: (x: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const x = c.getContext('2d');
  if (x) paint(x);
  return Texture.from(c);
}

export class Haze {
  readonly view = new Container();
  private readonly dots: ParticleContainer;
  private readonly clouds: Sprite[] = [];
  private readonly grains: Grain[] = [];
  private readonly grainTex: Texture;
  private readonly cloudTex: Texture;
  private whiffs: Whiff[] = [];
  /** 0 plain, 1 just after «нюхай»; eases toward its target. */
  private sharp = 0;
  private sharpTarget = 0;
  private time = 0;
  /** «Подсказки слепого режима»: sectors instead of the haze. */
  sectors = false;
  private readonly grid = new Graphics();

  constructor() {
    this.grainTex = canvasTexture(4, (x) => {
      x.fillStyle = '#fff';
      x.fillRect(0, 0, 4, 4);
    });
    this.cloudTex = canvasTexture(128, (x) => {
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
    });
    for (let i = 0; i < 6; i++) {
      const s = new Sprite(this.cloudTex);
      s.anchor.set(0.5);
      s.visible = false;
      this.clouds.push(s);
      this.view.addChild(s);
    }
    this.dots = new ParticleContainer({ texture: this.grainTex, dynamicProperties: { position: true, color: true, vertex: false, rotation: false, uvs: false } });
    for (let i = 0; i < GRAINS; i++) {
      const size = (1.1 + Math.random() * 1.5) / 4;
      const p = new Particle({ texture: this.grainTex, scaleX: size, scaleY: size, anchorX: 0.5, anchorY: 0.5, alpha: 0, tint: DUST });
      const g: Grain = { p, phi: 0, r: 0, phase: Math.random() * Math.PI * 2, speed: 1.5 + Math.random() * 3 };
      this.place(g);
      this.grains.push(g);
      this.dots.addParticle(p);
    }
    this.view.addChild(this.dots);
    this.grid.visible = false;
    this.view.addChild(this.grid);
  }

  /** Area-uniform radius, so the haze is not crowded at the centre. */
  private place(g: Grain): void {
    g.phi = Math.random() * Math.PI * 2;
    g.r = Math.sqrt(lerp(R_MIN * R_MIN, R_MAX * R_MAX, Math.random()));
    g.p.x = Math.cos(g.phi) * g.r;
    g.p.y = Math.sin(g.phi) * g.r;
  }

  /** What is smelled now, relative to where the striker looks. */
  setScents(scents: readonly Scent[]): void {
    this.whiffs = scents.map((s) => ({
      // Screen: x to the right, y down, so «ahead» is up.
      phi: Math.atan2(-s.ahead, s.right),
      r: Math.hypot(s.right, s.ahead) * CELL,
      amp: (s.strong ? 1.25 : 1) * s.strength,
      strong: s.strong,
    }));
  }

  /** «нюхай»: sharp for the rest of the turn. */
  sniff(on: boolean): void {
    this.sharpTarget = on ? 1 : 0;
  }

  get sharpened(): boolean {
    return this.sharpTarget > 0;
  }

  update(dt: number, reduced: boolean): void {
    this.time += dt;
    const k = this.sharpTarget > this.sharp ? 5 : 1.5;
    this.sharp += (this.sharpTarget - this.sharp) * Math.min(1, dt * k);
    this.dots.visible = !this.sectors;
    this.grid.visible = this.sectors;
    if (this.sectors) {
      for (const c of this.clouds) c.visible = false;
      this.drawSectors();
      return;
    }
    const sharp = this.sharp;
    const sPhi = lerp(0.62, 0.22, sharp);
    const sR = lerp(150, 30, sharp);
    const gain = lerp(0.5, 1, sharp);

    // Soft clouds under the grain, one per source.
    this.clouds.forEach((c, i) => {
      const w = this.whiffs[i];
      c.visible = !!w;
      if (!w) return;
      const rc = lerp(140, w.r, sharp);
      c.position.set(Math.cos(w.phi) * rc, Math.sin(w.phi) * rc);
      const rad = lerp(190, 70, sharp);
      c.width = c.height = rad * 2;
      c.tint = w.strong && sharp > 0.5 ? STRONG : 0xd8cbb0;
      c.alpha = Math.min(0.16, 0.09 * w.amp * gain + 0.03 * sharp);
    });

    // Grains: each one's brightness is the smell density where it sits, flickering.
    for (const g of this.grains) {
      if (!reduced && Math.random() < 0.03) this.place(g);
      let d = 0.02;
      let strong = 0;
      for (const w of this.whiffs) {
        const rc = lerp(140, w.r, sharp);
        const da = gap(g.phi, w.phi);
        const v = w.amp * gain * Math.exp(-(da * da) / (2 * sPhi * sPhi)) * Math.exp(-((g.r - rc) ** 2) / (2 * sR * sR));
        d += v;
        if (w.strong) strong += v;
      }
      const flicker = reduced ? 0.8 : 0.55 + 0.45 * Math.sin(g.phase + this.time * g.speed);
      g.p.alpha = Math.min(0.9, d * flicker);
      g.p.tint = strong > d * 0.5 && sharp > 0.5 ? STRONG : DUST;
    }
  }

  /** Eight wedges by three rings; each cell filled by how strongly it smells now. */
  private drawSectors(): void {
    const { fill, strong } = sectorCells(this.whiffs, this.sharpTarget > 0);
    const g = this.grid;
    g.clear();
    for (let i = 0; i < fill.length; i++) {
      const r1 = RINGS[i]!;
      const r2 = RINGS[i + 1]!;
      for (let j = 0; j < WEDGES; j++) {
        const a1 = AHEAD + (j - 0.5) * WEDGE + 0.02;
        const a2 = AHEAD + (j + 0.5) * WEDGE - 0.02;
        const v = fill[i]![j]!;
        g.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1)
          .arc(0, 0, r2, a1, a2)
          .arc(0, 0, r1, a2, a1, true)
          .closePath();
        if (v > 0.02) g.fill({ color: strong[i]![j] ? STRONG : DUST, alpha: 0.18 + 0.6 * Math.min(1, v) });
        g.stroke({ width: 1.5, color: DUST, alpha: 0.22 });
      }
    }
    // A notch at the top of the outer ring: ahead.
    const top = RINGS[RINGS.length - 1]!;
    g.moveTo(-9, -top - 14).lineTo(0, -top - 2).lineTo(9, -top - 14).stroke({ width: 2.5, color: DUST, alpha: 0.6 });
  }

  destroy(): void {
    if (!this.view.destroyed) this.view.destroy({ children: true });
    this.grainTex.destroy(true);
    this.cloudTex.destroy(true);
  }
}
