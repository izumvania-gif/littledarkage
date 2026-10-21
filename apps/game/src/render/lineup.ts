/**
 * The lineup (построение): the general and the book on the left, seven recruits facing him, Krypotkin's portrait on the wall.
 * Built twice from the same puppets in the same places: the ROSTA poster and the perekladka truth under it.
 */
import { BlurFilter, Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import { seededRng } from '../core/rng.ts';
import { glowTexture, grainTexture, speckleTexture, verticalGradient, vignetteTexture } from './kit.ts';
import { CAPTION_TOP, POSTER, REF_H, REF_W, TRUTH } from './palette.ts';
import { krypotkinPoster } from './portrait.ts';
import { Puppet, type Pose, type PuppetColors } from './puppet.ts';

const FLOOR = 500;
const GENERAL = { x: 250, scale: 2.1 };
const RECRUIT_SCALE = 1.65;
const RECRUIT_X = [520, 630, 740, 850, 960, 1070, 1180] as const;
const LAMP = { x: 600, y: 60 };
const PORTRAIT = { x: 1040, y: 80, w: 120, h: 170 };

/** One soldier drawn in both layers (and as a blurred shadow in the truth layer). Poses always change together. */
export class PuppetPair {
  readonly poster: Puppet;
  readonly truth: Puppet;
  readonly shadow: Puppet;

  constructor(poster: Puppet, truth: Puppet, shadow: Puppet) {
    this.poster = poster;
    this.truth = truth;
    this.shadow = shadow;
  }

  setPose(p: Pose): void {
    for (const x of [this.poster, this.truth, this.shadow]) x.setPose(p);
  }

  step(frame: number): void {
    for (const x of [this.poster, this.truth, this.shadow]) x.step(frame);
  }

  /** Steps forward (or back) along the line, in reference pixels. */
  nudge(dx: number): void {
    for (const x of [this.poster, this.truth, this.shadow]) x.root.x += dx;
  }
}

export interface LineupScene {
  poster: Container;
  truth: Container;
  general: PuppetPair;
  recruits: PuppetPair[];
  step(frame: number): void;
}

const POSTER_COLORS: PuppetColors = { body: POSTER.black, seam: POSTER.cream, eye: POSTER.cream };
const TRUTH_COLORS: PuppetColors = { body: TRUTH.cut, seam: 0x1b1815, eye: TRUTH.eye };
const SHADOW_COLORS: PuppetColors = { body: 0x000000, seam: 0x000000, eye: 0x000000 };

function place(p: Puppet, x: number, scale: number, faceRight: boolean, dx = 0, dy = 0): Puppet {
  p.root.position.set(x + dx, FLOOR + dy);
  p.root.scale.set(faceRight ? scale : -scale, scale);
  return p;
}

export function buildLineup(): LineupScene {
  const poster = new Container();
  const truth = new Container();
  const shadows = new Container();
  shadows.filters = [new BlurFilter({ strength: 6, quality: 3 })];
  shadows.alpha = 0.55;

  // ---- poster ----
  poster.addChild(new Graphics().rect(0, 0, REF_W, REF_H).fill(POSTER.cream));
  // Red wedge, printed a little off register.
  poster.addChild(new Graphics().poly([722, 2, 962, 2, 562, CAPTION_TOP + 2]).fill(POSTER.red));
  const lamp = new Graphics()
    .moveTo(LAMP.x, 0).lineTo(LAMP.x, 34).stroke({ width: 3, color: POSTER.black })
    .poly([LAMP.x - 16, 34, LAMP.x + 16, 34, LAMP.x + 28, 54, LAMP.x - 28, 54]).fill(POSTER.black)
    .circle(LAMP.x + 2, LAMP.y + 1, 9).fill(POSTER.red);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.15 + i * 0.117);
    lamp.moveTo(LAMP.x + Math.cos(a) * 18, LAMP.y + Math.sin(a) * 18).lineTo(LAMP.x + Math.cos(a) * 46, LAMP.y + Math.sin(a) * 46);
  }
  lamp.stroke({ width: 6, color: POSTER.black });
  poster.addChild(lamp);
  const portrait = krypotkinPoster(PORTRAIT.w, PORTRAIT.h);
  portrait.position.set(PORTRAIT.x, PORTRAIT.y);
  poster.addChild(portrait);
  // The register on its lectern: «вот в эту книгу».
  poster.addChild(new Graphics().rect(362, 432, 52, 68).fill(POSTER.black).rect(354, 418, 70, 14).fill(POSTER.red).rect(358, 422, 62, 3).fill(POSTER.cream));
  poster.addChild(new Graphics().rect(0, FLOOR, REF_W, 26).fill(POSTER.black));

  // ---- truth ----
  truth.addChild(new Sprite(verticalGradient(REF_W, REF_H, TRUTH.wallTop, TRUTH.wallBottom)));
  const glow = new Sprite(glowTexture(256));
  glow.anchor.set(0.5);
  glow.position.set(LAMP.x, LAMP.y + 40);
  glow.width = glow.height = 900;
  glow.tint = (TRUTH.lamp[0] << 16) | (TRUTH.lamp[1] << 8) | TRUTH.lamp[2];
  glow.alpha = 0.42;
  truth.addChild(glow);
  const strips = new Graphics();
  const r = seededRng(12);
  for (let i = 0; i < 9; i++) strips.rect(i * 150 - 20 + r() * 12, 0, 136, FLOOR).fill({ color: TRUTH.strip, alpha: i % 2 ? 0.16 : 0.1 });
  truth.addChild(strips);
  const truthPortrait = krypotkinPoster(PORTRAIT.w, PORTRAIT.h, { paper: 0xe8dfcc, field: 0x9d4a3d, ink: 0x2b2622 });
  truthPortrait.position.set(PORTRAIT.x, PORTRAIT.y);
  const portraitShadow = new Graphics().rect(PORTRAIT.x + 5, PORTRAIT.y + 7, PORTRAIT.w, PORTRAIT.h).fill(0x000000);
  shadows.addChild(portraitShadow);
  truth.addChild(new Graphics().moveTo(LAMP.x, 0).lineTo(LAMP.x, 34).stroke({ width: 2, color: 0x26221e }).poly([LAMP.x - 16, 34, LAMP.x + 16, 34, LAMP.x + 28, 54, LAMP.x - 28, 54]).fill(0x3a3029));
  const bulb = new Sprite(glowTexture(128));
  bulb.anchor.set(0.5);
  bulb.position.set(LAMP.x, LAMP.y);
  bulb.width = bulb.height = 70;
  bulb.tint = 0xffecbe;
  truth.addChild(bulb);
  truth.addChild(new Graphics().rect(0, FLOOR + 2, REF_W, REF_H - FLOOR).fill(TRUTH.floor));
  shadows.addChild(new Graphics().rect(367, 439, 52, 68).fill(0x000000));
  truth.addChild(shadows);
  truth.addChild(truthPortrait);
  truth.addChild(new Graphics().rect(362, 432, 52, 68).fill(0x4a3a2e).rect(354, 418, 70, 14).fill(0x6b3a30));

  // ---- puppets, in both layers ----
  const pair = (x: number, scale: number, right: boolean, general: boolean, phase: number) => {
    const opts = { general, phase };
    const pp = place(new Puppet(POSTER_COLORS, opts), x, scale, right);
    const tp = place(new Puppet(TRUTH_COLORS, opts), x, scale * 0.97, right);
    const sp = place(new Puppet(SHADOW_COLORS, opts), x, scale * 0.97, right, 6, 6);
    poster.addChild(pp.root);
    truth.addChild(tp.root);
    shadows.addChild(sp.root);
    return new PuppetPair(pp, tp, sp);
  };
  const general = pair(GENERAL.x, GENERAL.scale, true, true, 0);
  const recruits = RECRUIT_X.map((x, i) => pair(x, RECRUIT_SCALE, false, false, (i * 5) % 12));

  // ---- poster finish: caption band, print, frame ----
  poster.addChild(new Graphics().rect(0, CAPTION_TOP, REF_W, REF_H - CAPTION_TOP).fill(POSTER.cream).rect(0, CAPTION_TOP, REF_W, 6).fill(POSTER.black));
  poster.addChild(new Sprite(speckleTexture(REF_W, REF_H, 3)));
  poster.addChild(new Graphics().rect(5, 5, REF_W - 10, REF_H - 10).stroke({ width: 10, color: POSTER.black }));

  // ---- truth finish: fog near the floor, vignette, grain ----
  const fog = new Container();
  const fr = seededRng(14);
  for (let i = 0; i < 7; i++) {
    const s = new Sprite(glowTexture(256));
    s.anchor.set(0.5);
    s.position.set(fr() * REF_W, FLOOR - 40 + fr() * 160);
    s.width = 420 + fr() * 380;
    s.height = s.width * 0.45;
    s.tint = (TRUTH.fog[0] << 16) | (TRUTH.fog[1] << 8) | TRUTH.fog[2];
    s.alpha = 0.07;
    fog.addChild(s);
  }
  truth.addChild(fog);
  truth.addChild(new Sprite(vignetteTexture(REF_W, REF_H, 0.62)));
  const grain = new TilingSprite({ texture: grainTexture(160, 5), width: REF_W, height: REF_H });
  grain.alpha = 0.12;
  truth.addChild(grain);

  return {
    poster,
    truth,
    general,
    recruits,
    step(frame: number) {
      general.step(frame);
      for (const p of recruits) p.step(frame);
    },
  };
}
