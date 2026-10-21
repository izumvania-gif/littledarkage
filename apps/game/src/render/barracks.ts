/**
 * The barracks in cross-section (concept «Казарма»): the hatch to the tunnels, the mailbox, the general's
 * desk with the register, the corner with Krypotkin's portrait and the sofa, the lamp, the band's stage,
 * the tape recorder on its nightstand, two-tier bunks with a bench, the door to the sick bay.
 * Built twice from the same shapes in the same places: the ROSTA poster and the perekladka truth under it.
 * Figures are added by stages/barracks/BarracksStage.ts into the layers returned here.
 */
import { BlurFilter, Container, Graphics, Sprite, Text, TilingSprite } from 'pixi.js';
import { seededRng } from '../core/rng.ts';
import { glowTexture, grainTexture, speckleTexture, verticalGradient, vignetteTexture } from './kit.ts';
import { CAPTION_TOP, POSTER, REF_H, REF_W, TRUTH } from './palette.ts';
import { krypotkinPoster } from './portrait.ts';
import type { Hole } from './tears.ts';

/** The floor line everyone stands on. */
export const FLOOR = 500;
/** The furniture is drawn on a floor at 470 and lifted down to the real one. */
const F0 = 470;
const LIFT = FLOOR - F0;
/** Puppets are 100 units tall; in the room an ordinary rat is this many reference pixels per unit. */
export const FIGURE_SCALE = 1.2;

export interface SpotDef {
  x: number;
  /** Where the feet (or the seat) are. */
  y: number;
  /** Sitting there: the figure sits down unless told otherwise. */
  seat?: boolean;
  facing?: 'left' | 'right';
}

const line = (i: number): SpotDef => ({ x: 450 + i * 88, y: FLOOR, facing: 'left' });

/**
 * Named places on the floor, left to right. bench1–3 are the sofa under the portrait, bench4–6 the bench
 * before the bunks (the concert's audience faces the stage from both sides); line1–9 is a lineup before
 * the general's desk.
 */
export const SPOTS: Readonly<Record<string, SpotDef>> = {
  hatch: { x: 100, y: FLOOR, facing: 'left' },
  mailbox: { x: 214, y: FLOOR, facing: 'left' },
  desk: { x: 262, y: FLOOR, facing: 'right' },
  sofa: { x: 525, y: FLOOR },
  poster: { x: 525, y: FLOOR, facing: 'left' },
  bench1: { x: 478, y: 432 + LIFT, seat: true, facing: 'right' },
  bench2: { x: 527, y: 432 + LIFT, seat: true, facing: 'right' },
  bench3: { x: 576, y: 432 + LIFT, seat: true, facing: 'right' },
  center: { x: 640, y: FLOOR },
  stage: { x: 730, y: 440 + LIFT, facing: 'left' },
  stage1: { x: 678, y: 440 + LIFT, facing: 'right' },
  stage2: { x: 732, y: 440 + LIFT, facing: 'left' },
  stage3: { x: 786, y: 440 + LIFT, facing: 'left' },
  tape: { x: 858, y: FLOOR, facing: 'right' },
  bench4: { x: 905, y: 438 + LIFT, seat: true, facing: 'left' },
  bench5: { x: 975, y: 438 + LIFT, seat: true, facing: 'left' },
  bench6: { x: 1045, y: 438 + LIFT, seat: true, facing: 'left' },
  bunk1: { x: 930, y: 418 + LIFT, seat: true, facing: 'left' },
  bunk2: { x: 1000, y: 418 + LIFT, seat: true, facing: 'left' },
  bunk3: { x: 1085, y: 418 + LIFT, seat: true, facing: 'left' },
  bunk4: { x: 1155, y: 418 + LIFT, seat: true, facing: 'left' },
  bunk5: { x: 965, y: 318 + LIFT, seat: true, facing: 'left' },
  bunk6: { x: 1120, y: 318 + LIFT, seat: true, facing: 'left' },
  sickbay: { x: 1240, y: FLOOR, facing: 'right' },
  line1: line(0),
  line2: line(1),
  line3: line(2),
  line4: line(3),
  line5: line(4),
  line6: line(5),
  line7: line(6),
  line8: line(7),
  line9: line(8),
};

/** Where the player may walk. */
export const WALK_MIN = 60;
export const WALK_MAX = 1246;

export const LAMP = { x: 690, y: 116 };
export const ALARM = { x: 100, y: 292 + LIFT };
const ALARM0 = { x: 100, y: 292 };

/** HOLES.barracks of docs/red-glasses.html (480×360) scaled to the 1280×540 picture. */
export const BARRACKS_HOLES: readonly Hole[] = (
  [
    [470, 150, 0.05, 46],
    [10, 210, 0.08, 40],
    [250, 360, 0.1, 52],
    [60, 40, 0.16, 250],
    [452, 340, 0.22, 250],
    [256, 104, 0.3, 120],
    [330, 240, 0.32, 210],
    [110, 250, 0.38, 230],
    [420, 60, 0.45, 230],
    [20, 350, 0.42, 200],
    [240, 190, 0.6, 300],
  ] as const
).map(([x, y, start, max]) => ({ x: (x * REF_W) / 480, y: (y * CAPTION_TOP) / 360, start, max: max * 2.1 }));

export interface Room {
  poster: Container;
  truth: Container;
  /** Figures go here, one set per layer, plus their blurred shadows in the truth layer. */
  posterFigures: Container;
  truthFigures: Container;
  shadowFigures: Container;
  /** The warm light of the lamp in the truth layer (lights dim it). */
  lampGlow: Container;
  bulb: Sprite;
}


interface Ink {
  /** Main fill of furniture. */
  wood: number;
  dark: number;
  light: number;
  red: number;
  metal: number;
  mat: number;
  sofa: number;
  outline: number | null;
}

const POSTER_INK: Ink = { wood: POSTER.black, dark: POSTER.black, light: POSTER.cream, red: POSTER.red, metal: POSTER.black, mat: POSTER.cream, sofa: POSTER.red, outline: POSTER.black };
const TRUTH_INK: Ink = { wood: 0x4a3a2e, dark: 0x2b2420, light: 0xd8cbb0, red: 0x7a3b30, metal: 0x4d5148, mat: 0x8d7b62, sofa: 0x6e3a31, outline: null };

/** The furniture, as one Graphics per piece so the truth layer can cast shadows from the same shapes. */
function furniture(k: Ink): Graphics[] {
  const out: Graphics[] = [];
  const o = (g: Graphics, w = 3) => (k.outline !== null ? g.stroke({ width: w, color: k.outline, join: 'round' }) : g);

  // The hatch: an opening in the floor with a ladder, the lid leaning on the wall, a red lamp in a cage.
  const hatch = new Graphics().rect(40, F0, 112, 70).fill(k.dark);
  for (let y = F0 + 10; y < F0 + 70; y += 14) hatch.rect(66, y, 60, 4).fill(k === POSTER_INK ? k.light : 0x5a4a3c);
  hatch.rect(62, F0, 5, 70).fill(k === POSTER_INK ? k.light : 0x5a4a3c).rect(125, F0, 5, 70).fill(k === POSTER_INK ? k.light : 0x5a4a3c);
  out.push(hatch);
  const lid = new Graphics().poly([152, F0, 166, F0, 196, 360, 182, 356]).fill(k.metal);
  o(lid, 2);
  out.push(lid);
  const cage = new Graphics().rect(ALARM0.x - 18, ALARM0.y - 26, 36, 6).fill(k.dark).circle(ALARM0.x, ALARM0.y, 14).fill(k.red);
  cage.moveTo(ALARM0.x - 14, ALARM0.y).lineTo(ALARM0.x + 14, ALARM0.y).moveTo(ALARM0.x, ALARM0.y - 14).lineTo(ALARM0.x, ALARM0.y + 14).stroke({ width: 2, color: k.dark });
  out.push(cage);

  // The mailbox on the wall.
  const mail = new Graphics().rect(190, 290, 48, 58).fill(k === POSTER_INK ? k.red : k.metal).rect(198, 304, 32, 5).fill(k.dark).rect(190, 284, 48, 8).fill(k.dark);
  o(mail, 2);
  out.push(mail);

  // The general's desk with the register open on it.
  const desk = new Graphics()
    .rect(298, 398, 128, 10).fill(k.wood)
    .rect(304, 408, 8, 62).fill(k.wood)
    .rect(380, 408, 40, 62).fill(k.wood)
    .rect(386, 420, 28, 4).fill(k === POSTER_INK ? k.light : k.dark)
    .rect(386, 444, 28, 4).fill(k === POSTER_INK ? k.light : k.dark);
  out.push(desk);
  const book = new Graphics().poly([326, 397, 352, 392, 352, 398, 326, 398]).fill(k.light).poly([352, 392, 378, 397, 378, 398, 352, 398]).fill(k.light).rect(325, 396, 54, 3).fill(k.red);
  o(book, 1);
  out.push(book);

  // The sofa under the portrait: back, seat, arms, short legs.
  const sofa = new Graphics()
    .roundRect(448, 392, 158, 30, 6).fill(k.sofa)
    .roundRect(444, 420, 166, 24, 4).fill(k.sofa)
    .roundRect(434, 404, 18, 42, 6).fill(k.sofa)
    .roundRect(602, 404, 18, 42, 6).fill(k.sofa)
    .rect(444, 444, 6, 26).fill(k.dark)
    .rect(604, 444, 6, 26).fill(k.dark);
  o(sofa, 2.5);
  out.push(sofa);

  // The band's stage: a low platform with a backdrop painted with a sun.
  const stage = new Graphics().rect(640, 440, 184, 30).fill(k.wood);
  for (let x = 652; x < 824; x += 30) stage.rect(x, 444, 2, 22).fill(k === POSTER_INK ? k.light : k.dark);
  out.push(stage);

  // The nightstand and the cassette recorder.
  const tumb = new Graphics().rect(836, 420, 44, 50).fill(k.wood).rect(842, 438, 32, 3).fill(k === POSTER_INK ? k.light : k.dark);
  out.push(tumb);
  const rec = new Graphics()
    .rect(828, 392, 60, 28).fill(k === POSTER_INK ? k.red : 0x2f3033)
    .rect(846, 386, 24, 6).fill(k.dark)
    .circle(844, 405, 7).fill(k.light)
    .circle(872, 405, 7).fill(k.light)
    .circle(844, 405, 2).fill(k.dark)
    .circle(872, 405, 2).fill(k.dark);
  o(rec, 2);
  out.push(rec);

  // Two two-tier bunks.
  for (const bx of [892, 1046]) {
    const bunk = new Graphics()
      .rect(bx, 292, 7, 178).fill(k.wood)
      .rect(bx + 133, 292, 7, 178).fill(k.wood)
      .rect(bx, 318, 140, 9).fill(k.wood)
      .rect(bx, 418, 140, 9).fill(k.wood)
      .rect(bx, 290, 140, 5).fill(k.wood);
    out.push(bunk);
    const mats = new Graphics().roundRect(bx + 7, 306, 126, 13, 4).fill(k.mat).roundRect(bx + 7, 406, 126, 13, 4).fill(k.mat);
    o(mats, 2);
    out.push(mats);
  }
  // The bench before the bunks.
  const bench = new Graphics().rect(880, 436, 192, 8).fill(k.wood).rect(888, 444, 6, 26).fill(k.wood).rect(1058, 444, 6, 26).fill(k.wood);
  out.push(bench);

  // The door to the sick bay.
  const door = new Graphics().rect(1216, 330, 56, 140).fill(k.wood).rect(1224, 340, 40, 52).fill(k === POSTER_INK ? k.light : k.dark).circle(1262, 404, 3).fill(k === POSTER_INK ? k.red : k.light);
  o(door, 2);
  out.push(door);
  return out;
}

/** The lamp hanging over the room: cord and shade (the bulb and its light are separate). */
function lamp(k: Ink): Graphics {
  return new Graphics()
    .moveTo(LAMP.x, 0).lineTo(LAMP.x, 92).stroke({ width: 2.5, color: k === POSTER_INK ? POSTER.black : 0x26221e })
    .poly([LAMP.x - 16, 92, LAMP.x + 16, 92, LAMP.x + 30, 112, LAMP.x - 30, 112]).fill(k === POSTER_INK ? POSTER.black : 0x3a3029);
}

/** The pipe along the ceiling (the coordinators' «стук по трубе» has its pipe in the barracks too). */
function pipe(k: Ink): Graphics {
  const g = new Graphics().rect(0, 26, REF_W, 10).fill(k === POSTER_INK ? POSTER.black : 0x4a4540);
  for (let x = 120; x < REF_W; x += 240) g.rect(x, 22, 10, 18).fill(k === POSTER_INK ? POSTER.black : 0x3a3530);
  return g;
}

const PORTRAIT = { x: 472, y: 128, w: 110, h: 156 };

export function buildRoom(): Room {
  const poster = new Container();
  const truth = new Container();
  const posterFigures = new Container();
  const truthFigures = new Container();
  const shadowFigures = new Container();

  // ---- poster: flat cream, black and red, printed a little off register ----
  const pStatic = new Container();
  pStatic.addChild(new Graphics().rect(0, 0, REF_W, REF_H).fill(POSTER.cream));
  // The lamp's light as a red wedge down to the floor, printed off register.
  const wedge = new Graphics().poly([LAMP.x - 28, 112, LAMP.x + 28, 112, 900, FLOOR, 520, FLOOR]).fill(POSTER.red);
  wedge.position.set(2, 1.5);
  pStatic.addChild(wedge);
  pStatic.addChild(pipe(POSTER_INK));
  const banner = new Graphics().rect(352, 52, 380, 40).fill(POSTER.red);
  pStatic.addChild(banner);
  const slogan = new Text({ text: 'СИЛА — В СПЛОЧЁННОСТИ!', style: { fontFamily: '"Rubik Mono One", "Arial Black", sans-serif', fontSize: 20, fill: POSTER.cream }, resolution: 2 });
  slogan.anchor.set(0.5);
  slogan.position.set(542, 73);
  pStatic.addChild(slogan);
  const pPortrait = krypotkinPoster(PORTRAIT.w, PORTRAIT.h);
  pPortrait.position.set(PORTRAIT.x, PORTRAIT.y);
  pStatic.addChild(pPortrait);
  const pLamp = lamp(POSTER_INK);
  pLamp.circle(LAMP.x + 2, LAMP.y + 1, 8).fill(POSTER.red);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.15 + i * 0.117);
    pLamp.moveTo(LAMP.x + Math.cos(a) * 20, LAMP.y + Math.sin(a) * 20).lineTo(LAMP.x + Math.cos(a) * 44, LAMP.y + Math.sin(a) * 44);
  }
  pLamp.stroke({ width: 5, color: POSTER.black });
  pStatic.addChild(pLamp);
  // The floor: a black band, cream below it.
  pStatic.addChild(new Graphics().rect(0, FLOOR, REF_W, 18).fill(POSTER.black));
  for (const g of furniture(POSTER_INK)) {
    g.y = LIFT;
    pStatic.addChild(g);
  }
  const sign = new Text({ text: 'САНЧАСТЬ', style: { fontFamily: '"Rubik Mono One", "Arial Black", sans-serif', fontSize: 11, fill: POSTER.cream }, resolution: 2 });
  sign.anchor.set(0.5);
  const signPlate = new Graphics().rect(1200, 304 + LIFT, 80, 20).fill(POSTER.red);
  sign.position.set(1240, 314 + LIFT);
  pStatic.addChild(signPlate, sign);
  pStatic.cacheAsTexture(true);
  poster.addChild(pStatic, posterFigures);
  const pFinish = new Container();
  pFinish.addChild(new Graphics().rect(0, CAPTION_TOP, REF_W, REF_H - CAPTION_TOP).fill(POSTER.cream).rect(0, CAPTION_TOP, REF_W, 6).fill(POSTER.black));
  pFinish.addChild(new Sprite(speckleTexture(REF_W, REF_H, 7)));
  pFinish.addChild(new Graphics().rect(5, 5, REF_W - 10, REF_H - 10).stroke({ width: 10, color: POSTER.black }));
  pFinish.cacheAsTexture(true);
  poster.addChild(pFinish);

  // ---- truth: paper cut-outs under one warm lamp, in fog ----
  const tStatic = new Container();
  tStatic.addChild(new Sprite(verticalGradient(REF_W, REF_H, TRUTH.wallTop, TRUTH.wallBottom)));
  const strips = new Graphics();
  const r = seededRng(21);
  for (let i = 0; i < 10; i++) strips.rect(i * 132 - 16 + r() * 10, 0, 122, FLOOR).fill({ color: TRUTH.strip, alpha: i % 2 ? 0.15 : 0.09 });
  tStatic.addChild(strips);
  const shadows = new Container();
  shadows.filters = [new BlurFilter({ strength: 7, quality: 3 })];
  shadows.alpha = 0.5;
  const pieces = furniture(TRUTH_INK);
  for (const g of pieces) {
    g.y = LIFT;
    const s = g.clone();
    s.tint = 0x000000;
    s.position.set(5, 6 + LIFT);
    shadows.addChild(s);
  }
  shadows.addChild(new Graphics().rect(PORTRAIT.x + 5, PORTRAIT.y + 7, PORTRAIT.w, PORTRAIT.h).fill(0x000000));
  const tPipe = pipe(TRUTH_INK);
  const pipeShadow = tPipe.clone();
  pipeShadow.tint = 0;
  pipeShadow.position.set(0, 7);
  shadows.addChild(pipeShadow);
  tStatic.addChild(new Graphics().rect(0, FLOOR, REF_W, REF_H - FLOOR).fill(TRUTH.floor));
  tStatic.addChild(shadows);
  tStatic.addChild(tPipe);
  // The slogan banner, a faded cloth in the truth layer.
  tStatic.addChild(new Graphics().rect(352, 52, 380, 40).fill({ color: 0x8a4a3c, alpha: 0.8 }));
  const tSlogan = new Text({ text: 'СИЛА — В СПЛОЧЁННОСТИ!', style: { fontFamily: '"Rubik Mono One", "Arial Black", sans-serif', fontSize: 20, fill: 0xcbbfa6 }, resolution: 2 });
  tSlogan.anchor.set(0.5);
  tSlogan.position.set(542, 73);
  tSlogan.alpha = 0.7;
  tStatic.addChild(tSlogan);
  const tPortrait = krypotkinPoster(PORTRAIT.w, PORTRAIT.h, { paper: 0xe8dfcc, field: 0x9d4a3d, ink: 0x2b2622 });
  tPortrait.position.set(PORTRAIT.x, PORTRAIT.y);
  tStatic.addChild(tPortrait);
  for (const g of pieces) tStatic.addChild(g);
  tStatic.addChild(new Graphics().rect(1200, 304 + LIFT, 80, 20).fill(0x5a4a3c));
  tStatic.addChild(lamp(TRUTH_INK));
  tStatic.cacheAsTexture(true);
  truth.addChild(tStatic);

  // The lamp's light: a warm glow, its circle on the floor and a faint cone down to it (lights dim them together).
  const lampGlow = new Container();
  const warm = (TRUTH.lamp[0] << 16) | (TRUTH.lamp[1] << 8) | TRUTH.lamp[2];
  const glow = new Sprite(glowTexture(256));
  glow.anchor.set(0.5);
  glow.position.set(LAMP.x, LAMP.y + 120);
  glow.width = 1100;
  glow.height = 820;
  glow.tint = warm;
  glow.alpha = 0.5;
  glow.blendMode = 'add';
  const pool = new Sprite(glowTexture(256));
  pool.anchor.set(0.5);
  pool.position.set(LAMP.x, FLOOR + 6);
  pool.width = 760;
  pool.height = 120;
  pool.tint = warm;
  pool.alpha = 0.45;
  pool.blendMode = 'add';
  const cone = new Graphics().poly([LAMP.x - 26, LAMP.y, LAMP.x + 26, LAMP.y, LAMP.x + 330, FLOOR, LAMP.x - 330, FLOOR]).fill({ color: warm, alpha: 0.07 });
  cone.blendMode = 'add';
  lampGlow.addChild(glow, pool, cone);
  truth.addChild(lampGlow);

  shadowFigures.filters = [new BlurFilter({ strength: 6, quality: 2 })];
  shadowFigures.alpha = 0.5;
  truth.addChild(shadowFigures, truthFigures);

  const bulb = new Sprite(glowTexture(128));
  bulb.anchor.set(0.5);
  bulb.position.set(LAMP.x, LAMP.y);
  bulb.width = bulb.height = 80;
  bulb.tint = 0xffecbe;
  truth.addChild(bulb);

  const tFinish = new Container();
  const fog = new Container();
  const fr = seededRng(24);
  for (let i = 0; i < 8; i++) {
    const s = new Sprite(glowTexture(256));
    s.anchor.set(0.5);
    s.position.set(fr() * REF_W, FLOOR - 50 + fr() * 140);
    s.width = 420 + fr() * 380;
    s.height = s.width * 0.42;
    s.tint = (TRUTH.fog[0] << 16) | (TRUTH.fog[1] << 8) | TRUTH.fog[2];
    s.alpha = 0.07;
    fog.addChild(s);
  }
  tFinish.addChild(fog);
  tFinish.addChild(new Sprite(vignetteTexture(REF_W, REF_H, 0.6)));
  const grain = new TilingSprite({ texture: grainTexture(160, 9), width: REF_W, height: REF_H });
  grain.alpha = 0.12;
  tFinish.addChild(grain);
  truth.addChild(tFinish);

  return { poster, truth, posterFigures, truthFigures, shadowFigures, lampGlow, bulb };
}
