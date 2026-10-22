/**
 * The wall of the finale: the lineup again, but the poster is gone (t = 1) and the warm lamp with it. A projector
 * throws cold white-blue light on whoever stands in its spot; the line along the wall gets only the spill. A few
 * scraps of the ROSTA poster still cling to the plaster, and Крыпоткин's portrait hangs on one nail.
 * Everything is drawn in code, as paper cut-outs (the truth layer of «Красные очки»).
 */
import { BlurFilter, Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import { seededRng } from '../../core/rng.ts';
import { look, type Look } from '../../content/looks.ts';
import { PLAYER_ID } from '../../content/soldiers.ts';
import { glowTexture, grainTexture, verticalGradient, vignetteTexture } from '../../render/kit.ts';
import { MATTE, REF_H, REF_W } from '../../render/palette.ts';
import { krypotkinPoster } from '../../render/portrait.ts';
import { Puppet, type Pose, type PuppetColors, type PuppetLook } from '../../render/puppet.ts';
import type { Slot } from './plan.ts';

const FLOOR = 500;
const SPOT_X = 250;
const SLOT_X = [520, 630, 740, 850, 960, 1070, 1180] as const;
const RECRUIT_SCALE = 1.65;
const PORTRAIT = { x: 1040, y: 80, w: 120, h: 170 };

/** Cold light: the plaster, the floor and the cut-outs in it. */
const COLD = {
  wallTop: '#141920',
  wallBottom: '#252c33',
  floor: 0x13161a,
  light: 0xdbe7f4,
  spill: 0x9db4ca,
  scrap: 0x8e8c85,
  scrapRed: 0x6a2b27,
  scrapRim: 0xb9b6ad,
} as const;

const CUT: PuppetColors = { body: 0x1c1f24, seam: 0x090a0c, eye: 0xcbd5df, light: 0xaab4be, accent: 0x3a2b2a };
const SHADOW: PuppetColors = { body: 0x000000, seam: 0x000000, eye: 0x000000, light: 0x000000, accent: 0x000000 };

/** The faces of the fallen, in the order they stand: whoever comes next under a new name has one of these. */
const FACES = ['norkin', 'korochkina', 'syrkov', 'podvalny', 'sedoy', 'khvostov', 'zernov', 'kroshkin', 'cherdakov'] as const;

/** A soldier's look for the line: no instruments or books at the wall. */
function lineLook(l: Look): PuppetLook {
  const { instrument: _i, book: _b, ...rest } = l;
  return rest;
}

export interface WallScene {
  view: Container;
  /** Who stands in the spotlight: the general, or the player's own rat in his cap. */
  speaker: Puppet;
  /** The puppets along the wall, in the order of the slots. */
  line: Puppet[];
  /** 0 is darkness, 1 the cold light fully on. */
  setLight(k: number): void;
  /** A pose for a puppet and its shadow on the wall. */
  setPose(who: Puppet, p: Pose): void;
  /** Steps a puppet forward or back along the line (the roll call), with its shadow. */
  nudge(i: number, dx: number): void;
  step(frame: number): void;
  destroy(): void;
}

/** A torn scrap: a rough polygon whose edges are bitten at random (fixed per seed). */
function scrap(g: Graphics, pts: readonly number[], seed: number, fill: number, rim: number): void {
  const r = seededRng(seed);
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x0 = pts[i]!;
    const y0 = pts[i + 1]!;
    const x1 = pts[(i + 2) % pts.length]!;
    const y1 = pts[(i + 3) % pts.length]!;
    const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 14));
    for (let s = 0; s < steps; s++) {
      const k = s / steps;
      const j = s === 0 ? 0 : 7;
      out.push(x0 + (x1 - x0) * k + (r() - 0.5) * j, y0 + (y1 - y0) * k + (r() - 0.5) * j);
    }
  }
  g.poly(out).fill(fill).poly(out).stroke({ width: 2, color: rim, join: 'round' });
}

export function buildWall(spot: 'general' | 'player', slots: readonly Slot[]): WallScene {
  const view = new Container();
  const shadows = new Container();
  shadows.filters = [new BlurFilter({ strength: 7, quality: 3 })];
  shadows.alpha = 0.6;

  // ---- plaster and floor ----
  view.addChild(new Sprite(verticalGradient(REF_W, REF_H, COLD.wallTop, COLD.wallBottom)));
  const r = seededRng(31);
  const plaster = new Graphics();
  for (let i = 0; i < 9; i++) plaster.rect(i * 150 - 20 + r() * 12, 0, 136, FLOOR).fill({ color: 0x5d6a77, alpha: i % 2 ? 0.07 : 0.04 });
  view.addChild(plaster);

  // ---- what is left of the poster ----
  const scraps = new Graphics();
  scrap(scraps, [0, 0, 190, 0, 150, 34, 70, 60, 26, 132, 0, 150], 3, COLD.scrap, COLD.scrapRim);
  scrap(scraps, [700, 0, 980, 0, 930, 40, 860, 52, 790, 30, 735, 46], 5, COLD.scrap, COLD.scrapRim);
  scrap(scraps, [740, 0, 900, 0, 872, 36, 790, 28], 7, COLD.scrapRed, COLD.scrapRed);
  scrap(scraps, [1180, 0, REF_W, 0, REF_W, 210, 1252, 170, 1226, 74], 9, COLD.scrap, COLD.scrapRim);
  scrap(scraps, [0, 360, 34, 380, 46, 452, 18, FLOOR, 0, FLOOR], 11, COLD.scrap, COLD.scrapRim);
  scrap(scraps, [430, 440, 486, 432, 500, 470, 452, 488], 13, COLD.scrap, COLD.scrapRim);
  view.addChild(scraps);
  // Krypotkin on one nail.
  const portrait = krypotkinPoster(PORTRAIT.w, PORTRAIT.h, { paper: 0x8f8d86, field: 0x55302c, ink: 0x15181c });
  portrait.pivot.set(PORTRAIT.w / 2, 0);
  portrait.position.set(PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y);
  portrait.rotation = 0.09;
  shadows.addChild(new Graphics().rect(PORTRAIT.x + 10, PORTRAIT.y + 8, PORTRAIT.w, PORTRAIT.h).fill(0x000000));
  view.addChild(new Graphics().circle(PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y - 2, 3).fill(0x0b0c0e));

  view.addChild(new Graphics().rect(0, FLOOR + 2, REF_W, REF_H - FLOOR).fill(COLD.floor));
  // Where boots have stood: worn patches in front of the wall, empty or not.
  const worn = new Graphics();
  for (const x of SLOT_X) worn.ellipse(x - 6, FLOOR + 10, 34, 6).fill({ color: 0x2a3138, alpha: 0.8 });
  view.addChild(worn);

  // ---- cold light ----
  const lit = new Container();
  const wash = new Sprite(glowTexture(256));
  wash.anchor.set(0.5);
  wash.position.set(850, 330);
  wash.width = 1250;
  wash.height = 640;
  wash.tint = COLD.spill;
  wash.alpha = slots.length ? 0.2 : 0.3;
  wash.blendMode = 'add';
  const disc = new Sprite(glowTexture(256));
  disc.anchor.set(0.5);
  disc.position.set(SPOT_X, 330);
  disc.width = 470;
  disc.height = 560;
  disc.tint = COLD.light;
  disc.alpha = 0.55;
  disc.blendMode = 'add';
  const beam = new Graphics().poly([66, 30, 112, 30, 400, FLOOR + 30, 110, FLOOR + 30]).fill({ color: COLD.light, alpha: 0.09 });
  beam.blendMode = 'add';
  const pool = new Sprite(glowTexture(256));
  pool.anchor.set(0.5);
  pool.position.set(SPOT_X, FLOOR + 14);
  pool.width = 380;
  pool.height = 70;
  pool.tint = COLD.light;
  pool.alpha = 0.7;
  pool.blendMode = 'add';
  lit.addChild(wash, disc, beam, pool);
  view.addChild(lit);

  view.addChild(shadows);
  view.addChild(portrait);
  // The lectern with the book: «вот в эту книгу».
  shadows.addChild(new Graphics().rect(372, 438, 52, 68).fill(0x000000));
  view.addChild(new Graphics().rect(362, 432, 52, 68).fill(0x22262b).rect(354, 418, 70, 14).fill(0x3b2624));
  // The projector up in the corner, on its bracket.
  view.addChild(
    new Graphics()
      .rect(24, 0, 6, 26).fill(0x0b0c0e)
      .roundRect(30, 6, 74, 40, 6).fill(0x0e1013)
      .poly([96, 6, 120, 0, 126, 52, 96, 46]).fill(0x0e1013)
      .ellipse(122, 26, 5, 24).fill({ color: COLD.light, alpha: 0.85 }),
  );

  // ---- puppets ----
  const puppets = new Container();
  const pairs: { body: Puppet; shadow: Puppet }[] = [];
  const add = (lk: PuppetLook, x: number, scale: number, faceRight: boolean, phase: number) => {
    const body = new Puppet(CUT, { look: lk, phase });
    const shadow = new Puppet(SHADOW, { look: lk, phase });
    body.root.position.set(x, FLOOR);
    body.root.scale.set(faceRight ? scale : -scale, scale);
    // The projector is up on the left: shadows fall right and a little up the wall.
    shadow.root.position.set(x + 16, FLOOR - 4);
    shadow.root.scale.set(faceRight ? scale * 1.04 : -scale * 1.04, scale * 1.02);
    puppets.addChild(body.root);
    shadows.addChild(shadow.root);
    pairs.push({ body, shadow });
    return body;
  };
  const speaker =
    spot === 'general'
      ? add({ hat: 'cap' }, SPOT_X, 2.1, true, 0)
      : // The player's own rat, no taller than at the first lineup, under the general's cap.
        add({ ...look(PLAYER_ID), hat: 'cap' }, SPOT_X + 10, 1.8, true, 0);
  let face = 0;
  const line = slots.map((s, i) => {
    const x = SLOT_X[i] ?? SLOT_X[SLOT_X.length - 1]!;
    if (s.kind === 'player') return add({ hat: 'pilotka' }, x, RECRUIT_SCALE, false, (i * 5) % 12);
    const f = look(FACES[face++ % FACES.length]!);
    return add(lineLook(f), x, RECRUIT_SCALE * f.size, false, (i * 5) % 12);
  });
  view.addChild(puppets);

  // ---- finish: vignette, grain, and the dark that the light pushes back ----
  view.addChild(new Sprite(vignetteTexture(REF_W, REF_H, 0.7)));
  const grain = new TilingSprite({ texture: grainTexture(160, 7), width: REF_W, height: REF_H });
  grain.alpha = 0.1;
  view.addChild(grain);
  const dark = new Graphics().rect(0, 0, REF_W, REF_H).fill(MATTE);
  view.addChild(dark);

  const shadowOf = (who: Puppet) => pairs.find((pp) => pp.body === who);
  return {
    view,
    speaker,
    line,
    setLight(k: number) {
      dark.alpha = 1 - Math.max(0, Math.min(1, k));
    },
    setPose(who: Puppet, p: Pose) {
      who.setPose(p);
      shadowOf(who)?.shadow.setPose(p);
    },
    nudge(i: number, dx: number) {
      const p = line[i] ? shadowOf(line[i]) : undefined;
      if (!p) return;
      p.body.root.x += dx;
      p.shadow.root.x += dx;
    },
    step(frame: number) {
      for (const p of pairs) {
        p.body.step(frame);
        p.shadow.step(frame);
      }
    },
    destroy() {
      view.destroy({ children: true });
    },
  };
}
