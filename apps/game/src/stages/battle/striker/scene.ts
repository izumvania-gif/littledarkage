/**
 * The picture of the blind striker's stage: black, the smell haze, the faintest hint of one's own head and
 * of the blindfold's edge, red at the edges on a hit, the heart pulsing there when it can't be heard, and
 * (?debug) the true field in a corner. Everything drawn in code.
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { DX, DY, SIZE, type Battle } from '../../../core/battle.ts';
import { PLAYER_ID } from '../../../content/soldiers.ts';
import { REF_H, REF_W } from '../../../render/palette.ts';
import { Haze } from './haze.ts';

const CENTER = { x: REF_W / 2, y: 320 };

/** An edge texture: clear in the middle, opaque toward the frame edge. */
function edgeTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 144;
  const x = c.getContext('2d');
  if (x) {
    const g = x.createRadialGradient(128, 72, 40, 128, 72, 150);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 144);
  }
  return Texture.from(c);
}

export class StrikerScene {
  readonly view = new Container();
  readonly haze = new Haze();
  private readonly world = new Container();
  private readonly edgeTex = edgeTexture();
  private readonly blindfold: Sprite;
  private readonly hitEdge: Sprite;
  private readonly heartEdge: Sprite;
  private readonly map = new Graphics();
  private hit = 0;
  private beat = 0;
  /** Decaying trauma (game-feel): a smooth shake that ends by itself. */
  private trauma = 0;
  private shakeT = 0;

  constructor(red: boolean) {
    const black = new Graphics().rect(-40, -40, REF_W + 80, REF_H + 80).fill(0x050404);
    const self = new Graphics()
      .ellipse(0, 26, 22, 30)
      .moveTo(-14, 4)
      .quadraticCurveTo(0, -46, 14, 4)
      .stroke({ width: 2, color: 0xd8cbb0, alpha: 0.09 })
      .rect(-15, -10, 30, 5)
      .fill({ color: red ? 0xb0443a : 0xf2ead8, alpha: 0.16 });
    this.world.position.set(CENTER.x, CENTER.y);
    this.world.addChild(this.haze.view, self);
    const edge = (tint: number, alpha: number) => {
      const s = new Sprite(this.edgeTex);
      s.width = REF_W;
      s.height = REF_H;
      s.tint = tint;
      s.alpha = alpha;
      return s;
    };
    this.blindfold = edge(red ? 0xb0443a : 0xf2ead8, 0.05);
    this.hitEdge = edge(0xaa2018, 0);
    this.heartEdge = edge(0x781e18, 0);
    this.map.visible = false;
    this.view.addChild(black, this.world, this.blindfold, this.hitEdge, this.heartEdge, this.map);
  }

  /** A blow: the edges flush red and the frame shakes (none of it with reduced motion). */
  hurt(amount: number): void {
    this.hit = 1;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  bump(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** The heart seen instead of heard. */
  pulse(): void {
    this.beat = 1;
  }

  update(dt: number, reduced: boolean): void {
    this.haze.update(dt, reduced);
    this.hit = Math.max(0, this.hit - dt * 1.4);
    this.beat = Math.max(0, this.beat - dt * 3);
    this.hitEdge.alpha = 0.55 * this.hit;
    this.heartEdge.alpha = 0.35 * this.beat;
    let ox = 0;
    let oy = 0;
    let r = 0;
    if (this.trauma > 0 && !reduced) {
      this.trauma = Math.max(0, this.trauma - 1.6 * dt);
      this.shakeT += dt * 30;
      const k = this.trauma * this.trauma;
      ox = 16 * k * Math.sin(this.shakeT * 1.7);
      oy = 11 * k * Math.sin(this.shakeT * 2.3);
      r = 0.02 * k * Math.sin(this.shakeT * 1.1);
    } else this.trauma = 0;
    this.world.position.set(CENTER.x + ox, CENTER.y + oy);
    this.world.rotation = r;
  }

  /** ?debug: the true field (what the player can't see) in the top-right corner. */
  drawMap(b: Battle): void {
    const g = this.map.clear();
    g.visible = true;
    const cs = 16;
    const x0 = REF_W - 24 - cs * SIZE;
    const y0 = 24;
    g.rect(x0 - 4, y0 - 4, cs * SIZE + 8, cs * SIZE + 8).fill({ color: 0xeadfc6, alpha: 0.9 });
    for (let i = 0; i <= SIZE; i++) {
      g.moveTo(x0 + i * cs, y0).lineTo(x0 + i * cs, y0 + SIZE * cs);
      g.moveTo(x0, y0 + i * cs).lineTo(x0 + SIZE * cs, y0 + i * cs);
    }
    g.stroke({ width: 1, color: 0x1c1a18, alpha: 0.2 });
    for (const [x, y] of b.obstacles ?? []) g.rect(x0 + x * cs + 1, y0 + y * cs + 1, cs - 2, cs - 2).fill({ color: 0x5a4a3a, alpha: 0.85 });
    for (const t of b.traps) g.rect(x0 + t.x * cs + 4, y0 + t.y * cs + 4, cs - 8, cs - 8).fill({ color: 0x8e1f17, alpha: t.sprung ? 1 : 0.35 });
    for (const s of b.secrets) {
      if (s.taken) continue;
      g.poly([x0 + s.x * cs + 4, y0 + s.y * cs + 11, x0 + s.x * cs + 12, y0 + s.y * cs + 11, x0 + s.x * cs + 8, y0 + s.y * cs + 5]).fill(0xc9a227);
    }
    for (const c of b.creatures) {
      if (!c.alive) continue;
      const x = x0 + c.x * cs;
      const y = y0 + c.y * cs;
      g.rect(x + 2, y + 2, cs - 4, cs - 4).fill(0xfff8ec).stroke({ width: 1, color: 0x1c1a18 });
      if (c.strong) g.moveTo(x + 3, y + 3).lineTo(x + cs - 3, y + cs - 3).moveTo(x + cs - 3, y + 3).lineTo(x + 3, y + cs - 3).stroke({ width: 1, color: 0x1c1a18 });
    }
    for (const u of b.units) {
      if (!u.alive) continue;
      const cx = x0 + u.x * cs + cs / 2;
      const cy = y0 + u.y * cs + cs / 2;
      const col = u.id === PLAYER_ID ? 0xc62f24 : 0x1c1a18;
      g.circle(cx, cy, 5).fill(col);
      g.moveTo(cx, cy).lineTo(cx + DX[u.dir] * 8, cy + DY[u.dir] * 8).stroke({ width: 2, color: col });
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
    this.haze.destroy();
    this.edgeTex.destroy(true);
  }
}
