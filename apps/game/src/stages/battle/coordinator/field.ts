/**
 * The tunnel in «Красные очки», built twice from the same shapes in the same places (docs/red-glasses.html,
 * «Бой»): the ROSTA poster (black ground, red lamp rays, cream grid, cream sheets, flat strikers with cream
 * blindfolds, «ТРЕ-ВО-ГА!») over the perekladka truth (dark tunnel, the red lamp's glow, pale glowing paper,
 * dark paper strikers, chalk, fog, grain). The static parts are cached as textures; the dynamic layer is
 * redrawn only at a flash, since nothing on the field can be seen between flashes anyway.
 */
import { Container, Graphics, Sprite, Text, TilingSprite, type Texture } from 'pixi.js';
import { smooth } from '../../../core/rng.ts';
import type { Battle, Unit } from '../../../core/battle.ts';
import { glowTexture, grainTexture, speckleTexture, vignetteTexture } from '../../../render/kit.ts';
import { REF_H, REF_W } from '../../../render/palette.ts';
import type { Hole } from '../../../render/tears.ts';
import { ANGLE, blindfold, crumplePoints, edge, FIELD_BOTTOM, fieldOutline, LAMP, pt, RAT, ratBody, ratTail, rayWedges, sheetPoints, TRIANGLE, ZONE_Y, zoneX } from './geometry.ts';
import { SIZE } from '../../../core/battle.ts';

/** The battle's tears (red-glasses.html HOLES.battle, scaled from its 480×360 frame): they open sooner than the barracks'. */
export const BATTLE_HOLES: readonly Hole[] = (
  [
    [240, 150, 0.03, 70],
    [470, 20, 0.06, 70],
    [10, 350, 0.08, 70],
    [180, 120, 0.13, 240],
    [330, 210, 0.17, 240],
    [240, 320, 0.24, 220],
    [60, 60, 0.27, 240],
    [440, 300, 0.3, 240],
    [240, 180, 0.45, 330],
  ] as const
).map(([x, y, start, max]) => ({ x: (x * REF_W) / 480, y: (y * REF_H) / 360, start, max: max * 2.4 }));

type Rgb = readonly [number, number, number];
const hex = ([r, g, b]: Rgb) => (r << 16) | (g << 8) | b;
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * k)) as unknown as Rgb;

/** The poster fades with the game: red to brick, cream to dull paper (red-glasses.html rostaPal). */
function rosta(t: number) {
  const k = smooth(0.06, 0.78, t);
  return {
    red: hex(mix([198, 47, 36], [128, 78, 64], k)),
    cream: hex(mix([234, 223, 198], [214, 202, 176], k)),
    ochre: hex(mix([201, 154, 59], [150, 124, 84], k)),
    black: 0x1c1a18,
  };
}

const TRUTH = {
  ground: 0x171b20,
  slab: 0x1e242a,
  zone: 0x2a2420,
  paper: 0xe9e2d4,
  cut: 0x5c554d,
  coord: 0x433b33,
  dead: 0x3d3833,
  chalk: 0xd7cdb9,
  crumple: 0xa99486,
  secret: 0xd8cbb0,
  lamp: 0xbe483a,
};

/** What a flash shows besides the battle itself. */
export interface Scene {
  b: Battle;
  /** Creatures crushed so far, where they died. */
  crushed: { x: number; y: number; id: number; strong: boolean }[];
  /** Units trembling (hit last turn): their quirks are on, and the player can see it. */
  scared: ReadonlySet<string>;
  /** Coordinators standing in the zone (not the player: the player is the camera). */
  coords: { id: string; x: number }[];
}

export class BattleField {
  readonly poster = new Container();
  readonly truth = new Container();
  private readonly posterDyn = new Container();
  private readonly truthDyn = new Container();
  private readonly t: number;
  private readonly pal: ReturnType<typeof rosta>;
  private readonly glow: Texture;
  private readonly textures: Texture[] = [];

  constructor(t: number) {
    this.t = t;
    this.pal = rosta(t);
    this.glow = glowTexture(128);
    this.textures.push(this.glow);
    this.buildPoster();
    this.buildTruth();
  }

  private tex(t: Texture): Texture {
    this.textures.push(t);
    return t;
  }

  private buildPoster(): void {
    const p = this.pal;
    const back = new Container();
    back.addChild(new Graphics().rect(0, 0, REF_W, REF_H).fill(p.black));
    // Red rays from the lamp, only over the field.
    const rays = new Graphics();
    for (const w of rayWedges()) rays.poly(w).fill(p.red);
    const mask = new Graphics().poly(fieldOutline()).fill(0xffffff);
    rays.mask = mask;
    back.addChild(rays, mask);
    const grid = new Graphics();
    for (let gx = -0.5; gx <= 8.5; gx += 1) {
      const a = edge(gx, 0);
      const z = edge(gx, SIZE);
      grid.moveTo(a.x, a.y).lineTo(z.x, z.y);
    }
    for (let u = 0; u <= SIZE; u += 1) {
      const a = edge(-0.5, u);
      const z = edge(8.5, u);
      grid.moveTo(a.x, a.y).lineTo(z.x, z.y);
    }
    grid.stroke({ width: 1.4, color: p.cream, alpha: 0.24 });
    grid.poly(fieldOutline()).stroke({ width: 4, color: p.cream });
    back.addChild(grid);
    // The parapet of the zone and the lamp over it.
    back.addChild(
      new Graphics()
        .rect(edge(-0.5, SIZE).x - 60, FIELD_BOTTOM + 14, edge(8.5, SIZE).x - edge(-0.5, SIZE).x + 120, 6)
        .fill(p.cream)
        .circle(LAMP.x, LAMP.y, 15)
        .fill(p.red)
        .stroke({ width: 3, color: p.cream }),
    );
    // ROSTA lettering on the free left of the frame.
    const big = new Text({ text: 'ТРЕ-\nВО-\nГА!', style: { fontFamily: 'Rubik Mono One', fontSize: 62, lineHeight: 70, fill: p.red } });
    big.position.set(40, 64);
    const small = new Text({ text: 'ГЛЯДИ\nВО\nВСПЫШ-\nКУ!', style: { fontFamily: 'Rubik Mono One', fontSize: 26, lineHeight: 34, fill: p.cream } });
    small.position.set(44, 330);
    back.addChild(big, small);
    back.cacheAsTexture(true);
    const print = new Sprite(this.tex(speckleTexture(REF_W, REF_H, 21)));
    this.poster.addChild(back, this.posterDyn, print);
  }

  private buildTruth(): void {
    const back = new Container();
    back.addChild(new Graphics().rect(0, 0, REF_W, REF_H).fill(TRUTH.ground));
    // The floor of the tunnel as a cut-out slab with its shadow.
    back.addChild(new Graphics().poly(fieldOutline().map((v, i) => v + (i % 2 ? 9 : 5))).fill({ color: 0x000000, alpha: 0.5 }));
    back.addChild(new Graphics().poly(fieldOutline()).fill(TRUTH.slab));
    const glow = new Sprite(this.glow);
    glow.anchor.set(0.5);
    glow.position.set(LAMP.x, LAMP.y - 120);
    glow.width = 1250;
    glow.height = 900;
    glow.tint = TRUTH.lamp;
    glow.alpha = 0.6 - 0.15 * this.t;
    back.addChild(glow);
    const grid = new Graphics();
    for (let gx = -0.5; gx <= 8.5; gx += 1) {
      const a = edge(gx, 0);
      const z = edge(gx, SIZE);
      grid.moveTo(a.x, a.y).lineTo(z.x, z.y);
    }
    for (let u = 0; u <= SIZE; u += 1) {
      const a = edge(-0.5, u);
      const z = edge(8.5, u);
      grid.moveTo(a.x, a.y).lineTo(z.x, z.y);
    }
    grid.stroke({ width: 1, color: 0xe6dccd, alpha: 0.12 });
    back.addChild(grid);
    // The zone: a darker shelf behind the parapet.
    back.addChild(new Graphics().rect(0, FIELD_BOTTOM + 12, REF_W, REF_H - FIELD_BOTTOM).fill(TRUTH.zone).rect(0, FIELD_BOTTOM + 12, REF_W, 3).fill({ color: 0x000000, alpha: 0.6 }));
    const bulb = new Sprite(this.glow);
    bulb.anchor.set(0.5);
    bulb.position.set(LAMP.x, LAMP.y);
    bulb.width = bulb.height = 90;
    bulb.tint = 0xf06e5a;
    back.addChild(bulb, new Graphics().circle(LAMP.x, LAMP.y, 9).fill(0xd0574a));
    back.cacheAsTexture(true);

    const front = new Container();
    for (let i = 0; i < 10; i++) {
      const s = new Sprite(this.glow);
      s.anchor.set(0.5);
      const a = edge(-0.5 + ((i * 37) % 10), ((i * 53) % 9) + 0.5);
      s.position.set(a.x, a.y);
      s.width = 380 + ((i * 71) % 5) * 60;
      s.height = s.width * 0.42;
      s.tint = 0xaab2ba;
      s.alpha = 0.08 + 0.1 * this.t;
      front.addChild(s);
    }
    front.addChild(new Sprite(this.tex(vignetteTexture(REF_W, REF_H, 0.62 + 0.15 * this.t))));
    const grain = new TilingSprite({ texture: this.tex(grainTexture(160, 9)), width: REF_W, height: REF_H });
    grain.alpha = 0.16;
    front.addChild(grain);
    this.truth.addChild(back, this.truthDyn, front);
  }

  /** Redraws everything that moves: called at a flash, right before the snapshot. */
  draw(scene: Scene): void {
    for (const c of [this.posterDyn, this.truthDyn]) {
      for (const child of c.removeChildren()) child.destroy({ children: true });
    }
    const p = this.pal;
    const P = new Graphics();
    const T = new Graphics();
    this.posterDyn.addChild(P);
    this.truthDyn.addChild(T);
    const { b } = scene;

    for (const tr of b.traps) {
      if (!tr.sprung) continue;
      const c = pt(tr.x, tr.y);
      cross(P, c.x, c.y, c.s, p.cream, 5, 1);
      cross(T, c.x, c.y, c.s, TRUTH.chalk, 3, 0.75);
    }
    for (const k of scene.crushed) {
      const c = pt(k.x, k.y);
      const pts = place(crumplePoints(k.id), c.x, c.y, c.s, c.s * 0.72);
      P.poly(pts).fill({ color: p.cream, alpha: 0.55 });
      T.poly(pts.map((v, i) => v + (i % 2 ? 4 : 2))).fill({ color: 0x000000, alpha: 0.45 });
      T.poly(pts).fill(TRUTH.crumple);
    }

    // Depth order: far rows first, each thing its own cut-out in both layers.
    const PL = this.posterDyn;
    const TL = this.truthDyn;
    const items: { y: number; draw: () => void }[] = [];
    for (const s of b.secrets) {
      if (s.taken) continue;
      items.push({
        y: s.y - 0.2,
        draw: () => {
          const c = pt(s.x, s.y);
          const pts = place(TRIANGLE, c.x, c.y, c.s, c.s * 0.75);
          PL.addChild(new Graphics().poly(pts).fill(p.cream));
          TL.addChild(new Graphics().poly(pts.map((v, i) => v + (i % 2 ? 4 : 2))).fill({ color: 0x000000, alpha: 0.5 }).poly(pts).fill(TRUTH.secret));
        },
      });
    }
    for (const cr of b.creatures) {
      if (!cr.alive) continue;
      items.push({
        y: cr.y - 0.1,
        draw: () => {
          const c = pt(cr.x, cr.y);
          const pts = place(sheetPoints(cr.id), c.x, c.y, c.s, c.s * 0.6);
          const gp = new Graphics().poly(pts).fill(p.cream);
          const halo = new Sprite(this.glow);
          halo.anchor.set(0.5);
          halo.position.set(c.x, c.y);
          halo.width = 120 * c.s;
          halo.height = 70 * c.s;
          halo.tint = 0xece5d6;
          halo.alpha = 0.55;
          const gt = new Graphics().poly(pts).fill(TRUTH.paper);
          if (cr.strong) {
            cross(gp, c.x, c.y, c.s * 0.75, p.black, 7, 1);
            cross(gt, c.x, c.y, c.s * 0.75, 0x2a2522, 5, 1);
          }
          PL.addChild(gp);
          TL.addChild(halo, gt);
        },
      });
    }
    for (const u of b.units) items.push({ y: u.y + 0.1, draw: () => this.rat(u, scene.scared.has(u.id)) });
    items.sort((a, z) => a.y - z.y);
    for (const it of items) it.draw();

    // Coordinators from behind in the zone: big heads facing the field.
    for (const c of scene.coords) {
      const x = zoneX(c.x);
      this.figure(PL, x, ZONE_Y, ANGLE[0], 3.4, p.ochre, null, p.ochre);
      this.figure(TL, x + 4, ZONE_Y + 6, ANGLE[0], 3.4, 0x000000, null, 0x000000, 0.4);
      this.figure(TL, x, ZONE_Y, ANGLE[0], 3.4, TRUTH.coord, null, TRUTH.coord);
    }
  }

  private rat(u: Unit, scared: boolean): void {
    const PL = this.posterDyn;
    const TL = this.truthDyn;
    const c = pt(u.x, u.y);
    const s = c.s * RAT;
    const red = this.t >= 0.6;
    if (!u.alive) {
      // A body lies where it fell: flat on its side, no blindfold.
      this.figure(PL, c.x, c.y, ANGLE[u.dir] + Math.PI / 2, s * 0.9, this.pal.ochre, null, this.pal.ochre, 0.55);
      this.figure(TL, c.x, c.y, ANGLE[u.dir] + Math.PI / 2, s * 0.9, TRUTH.dead, null, TRUTH.dead);
      return;
    }
    this.figure(PL, c.x, c.y, ANGLE[u.dir], s, this.pal.ochre, this.pal.cream, this.pal.ochre);
    this.figure(TL, c.x + 3, c.y + 5, ANGLE[u.dir], s, 0x000000, null, 0x000000, 0.45);
    this.figure(TL, c.x, c.y, ANGLE[u.dir], s, TRUTH.cut, red ? 0xb0443a : 0xe9e2d4, TRUTH.cut);
    if (scared) {
      // Tremble marks: he was hit, and it shows.
      for (const [layer, col] of [
        [PL, this.pal.cream],
        [TL, 0xe9e2d4],
      ] as const) {
        const g = new Graphics();
        for (const side of [-1, 1]) {
          g.moveTo(c.x + side * 22 * c.s, c.y - 14 * c.s).lineTo(c.x + side * 28 * c.s, c.y - 8 * c.s);
          g.moveTo(c.x + side * 24 * c.s, c.y - 2 * c.s).lineTo(c.x + side * 31 * c.s, c.y + 2 * c.s);
        }
        layer.addChild(g.stroke({ width: 2.2, color: col, cap: 'round' }));
      }
    }
  }

  /** One rat cut-out: body, tail and (on the field) the blindfold, rotated and scaled in place. */
  private figure(layer: Container, x: number, y: number, angle: number, scale: number, body: number, band: number | null, tail: number, alpha = 1): void {
    const local = new Graphics();
    ratTail(local, tail, 2.4);
    ratBody(local, body, 1);
    if (band !== null) blindfold(local, band);
    local.position.set(x, y);
    local.rotation = angle;
    local.scale.set(scale);
    local.alpha = alpha;
    layer.addChild(local);
  }

  /** Drops whatever is still alive: the truth may already have gone with the glasses' view. */
  destroy(): void {
    if (!this.poster.destroyed) this.poster.destroy({ children: true });
    if (!this.truth.destroyed) this.truth.destroy({ children: true });
    for (const t of this.textures) if (!t.destroyed) t.destroy(true);
  }
}

function place(pts: readonly number[], x: number, y: number, sx: number, sy: number): number[] {
  return pts.map((v, i) => (i % 2 ? y + v * sy : x + v * sx));
}

function cross(g: Graphics, x: number, y: number, s: number, color: number, width: number, alpha: number): void {
  const w = 15 * s;
  const h = 9 * s;
  g.moveTo(x - w, y - h).lineTo(x + w, y + h).moveTo(x + w, y - h).lineTo(x - w, y + h).stroke({ width: width * s, color, alpha, cap: 'round' });
}
