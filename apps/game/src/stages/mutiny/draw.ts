/**
 * The brawl drawn from above in «Красные очки», with the cut-outs of the barracks (the tunnel's rat seen from
 * above, render: battle/coordinator/geometry.ts): the poster — cream floor, black walls and bodies, red
 * blankets, carpet and blood, every weapon on the floor outlined — over the truth: dark boards and grey paper
 * figures with not a drop of red. Rooms, bodies and blood are baked into the poster; what moves is drawn on
 * top every frame, its poses stepping at 12 frames a second.
 */
import { Container, Graphics, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { seededRng } from '../../core/rng.ts';
import { look } from '../../content/looks.ts';
import { ROOM, type Furniture, type Rect, type RoomDef, type WeaponKind } from '../../content/mutiny.ts';
import { glowTexture, grainTexture, speckleTexture, vignetteTexture } from '../../render/kit.ts';
import { CAPTION_TOP, POSTER, REF_H, REF_W, TRUTH } from '../../render/palette.ts';
import type { Hole } from '../../render/tears.ts';
import type { Unit } from './brawl.ts';

/** A rat from above is this many pixels per unit of the tunnel's cut-out. */
const S = 2;

/** The truth's paper: grey cut-outs, dark wood, the dark floor. */
const PAPER = { cut: 0x2d2925, body: 0x8a837a, seam: 0x5c564f, wood: 0x4a3a2e, mattress: 0x6f6252, wall: 0x24211e } as const;

/** A shade of the poster's cream for floorboards and seams. */
const BOARD = 0xd9ccae;

/**
 * The tears of the mutiny: at its start only the edges fray (t ≈ 0.2); when the lights go out, everything
 * opens at once over the rooms.
 */
export const MUTINY_HOLES: readonly Hole[] = [
  { x: 1262, y: 40, start: 0.05, max: 90 },
  { x: 16, y: 520, start: 0.08, max: 80 },
  { x: 640, y: 532, start: 0.12, max: 70 },
  { x: 260, y: 160, start: 0.22, max: 520 },
  { x: 980, y: 360, start: 0.24, max: 560 },
  { x: 640, y: 120, start: 0.26, max: 520 },
  { x: 200, y: 460, start: 0.28, max: 480 },
  { x: 1120, y: 110, start: 0.3, max: 480 },
  { x: 640, y: 380, start: 0.32, max: 620 },
];

/** The generated textures, made once for the brawl (a room is rebuilt on every restart) and dropped at its end. */
const textures = new Map<string, Texture>();
function cached(key: string, make: () => Texture): Texture {
  let t = textures.get(key);
  if (!t) textures.set(key, (t = make()));
  return t;
}

export function dropTextures(): void {
  for (const t of textures.values()) t.destroy(true);
  textures.clear();
}

// ---------- the rat from above ----------

/** The tunnel's rat (nose toward +x) in local units: body, snout, ears; k grows it (a rim under it). */
function ratShape(g: Graphics, color: number, girth = 1, k = 1): Graphics {
  g.ellipse(0, 0, 9 * k, 6 * girth * k).fill(color);
  g.moveTo(17 * k, 0).quadraticCurveTo(12 * k, -5.2 * k, 6 * k, -4.6 * k).quadraticCurveTo(3 * k, 0, 6 * k, 4.6 * k).quadraticCurveTo(12 * k, 5.2 * k, 17 * k, 0).closePath().fill(color);
  g.circle(6.5 * k, -5.6 * girth, 2.6 * k).fill(color);
  g.circle(6.5 * k, 5.6 * girth, 2.6 * k).fill(color);
  return g;
}

function tailShape(g: Graphics, color: number, swish: number, width = 2.2): Graphics {
  return g.moveTo(-8.5, 0).quadraticCurveTo(-17, 7 * swish, -26, -1 * swish).stroke({ width, color, cap: 'round' });
}

/** A weapon in local units pointing along +x from the hand. */
export function weaponShape(g: Graphics, kind: WeaponKind, fill: number, line: number, lw = 0.9): Graphics {
  const st = { width: lw, color: line };
  switch (kind) {
    case 'pen':
      g.poly([0, -0.8, 9, -0.8, 12, 0, 9, 0.8, 0, 0.8]).fill(fill).stroke(st);
      break;
    case 'stool':
      g.circle(5, 0, 4.6).fill(fill).stroke(st);
      g.circle(5, 0, 1.4).fill(line);
      break;
    case 'leg':
      g.rect(0, -1.3, 16, 2.6).fill(fill).stroke(st);
      break;
    case 'poker':
      g.rect(0, -0.7, 17, 1.4).fill(fill).stroke(st);
      g.moveTo(17, 0).lineTo(19, 2.6).lineTo(20.5, 1.2).stroke({ width: 1.4, color: line });
      break;
    case 'shovel':
      g.rect(0, -0.8, 12, 1.6).fill(fill).stroke(st);
      g.poly([12, -3.4, 18, -3, 20, 0, 18, 3, 12, 3.4]).fill(fill).stroke(st);
      break;
    case 'bottle':
      g.rect(0, -1, 4, 2).fill(fill).stroke(st);
      g.poly([4, -2.6, 9, -2.8, 11, -1.4, 9.4, -0.2, 12, 0.8, 9.6, 2.8, 4, 2.6]).fill(fill).stroke(st);
      break;
    case 'mug':
      g.circle(3.2, 0, 3).fill(fill).stroke(st);
      g.circle(3.2, -4, 1.4).stroke({ width: 1.2, color: line });
      break;
    case 'boot':
      g.poly([0, -2.4, 8, -2.4, 8, -4.4, 11, -4.4, 11, 2.4, 0, 2.4]).fill(fill).stroke(st);
      break;
    case 'nagan':
      g.rect(0, -1, 9, 2).fill(fill).stroke(st);
      g.circle(2, 0, 2.3).fill(fill).stroke(st);
      g.poly([-1, 0.6, -4, 3, -2.4, 4, 0.6, 1.6]).fill(fill).stroke(st);
      break;
    case 'fists':
      break;
  }
  return g;
}

export type Role = 'player' | 'ally' | 'loyal' | 'neutral' | 'general' | 'krypotkin';

/** The look details a face adds from above: a cap, a beard and glasses, a moustache, a braid, a wider coat. */
function details(g: Graphics, face: string, light: number, dark: number): void {
  const lk = look(face);
  if (face === 'general') {
    g.circle(3, 0, 6.6).fill(dark);
    g.circle(3, 0, 5.4).stroke({ width: 1.5, color: POSTER.red });
    g.moveTo(8.4, -4).quadraticCurveTo(12.6, 0, 8.4, 4).lineTo(8.4, -4).fill(light);
  }
  if (lk.beard) g.ellipse(13.5, 0, 4.2, 3.6).fill(light);
  if (lk.glasses) g.circle(11.5, -2.4, 1.6).circle(11.5, 2.4, 1.6).stroke({ width: 0.8, color: light });
  if (lk.moustache) g.moveTo(15.5, 0).quadraticCurveTo(14, -4, 11, -4.6).moveTo(15.5, 0).quadraticCurveTo(14, 4, 11, 4.6).stroke({ width: 1, color: light });
  if (lk.braid) g.moveTo(1, 0).quadraticCurveTo(-4, 2, -7, 1).stroke({ width: 1.8, color: light }).circle(-7, 1, 1.4).fill(POSTER.red);
  if (lk.book) g.rect(-3, -9.6, 6, 3.4).fill(light).stroke({ width: 0.6, color: dark });
}

interface Paws {
  l: [number, number];
  r: [number, number];
  /** The weapon's angle in the hand. */
  wa: number;
  swish: number;
}

/** Hands by pose; the walk is four frames of the paws going back and forth. */
function paws(pose: 'rest' | 'walk' | 'windup' | 'strike' | 'frozen' | 'sit', frame: number): Paws {
  switch (pose) {
    case 'walk': {
      const k = [1, 0, -1, 0][frame % 4]!;
      return { l: [7 - 2.5 * k, -7.5], r: [7 + 2.5 * k, 7.5], wa: 0.3, swish: k };
    }
    case 'windup':
      return { l: [7, -7], r: [-3, 11.5], wa: 2.4, swish: -0.6 };
    case 'strike':
      return { l: [5, -7.5], r: [15, 3.5], wa: -0.15, swish: 0.6 };
    case 'frozen':
      return { l: [0, -8.6], r: [0, 8.6], wa: 1.57, swish: 0 };
    case 'sit':
      return { l: [6, -5], r: [6, 5], wa: 0.6, swish: 1.6 };
    default:
      return { l: [7, -7.5], r: [7, 7.5], wa: 0.35, swish: 0.3 + 0.1 * Math.sin(frame / 3) };
  }
}

/** A live figure of the brawl as the poster draws it, its pose stepping at 12 fps. */
export class RatCut {
  readonly root = new Container();
  private readonly ring = new Graphics();
  private readonly g = new Graphics();
  private readonly weapon = new Graphics();
  private readonly role: Role;
  private readonly face: string;
  private held: WeaponKind = 'fists';
  private key = '';

  constructor(role: Role, face: string) {
    this.role = role;
    this.face = face;
    this.root.addChild(this.ring, this.g, this.weapon);
    this.root.scale.set(S * look(face).size);
  }

  /** Moves every frame; redraws only when the pose, the frame of a walk or what is in hand changed. */
  update(u: Unit, pose: Parameters<typeof paws>[0], frame: number, band: boolean): void {
    this.root.position.set(u.x, u.y);
    this.root.rotation = u.dir;
    const key = `${pose}|${pose === 'walk' || pose === 'rest' ? frame % 4 : 0}|${band}|${u.frozen > 0}`;
    if (u.weapon !== this.held) {
      this.held = u.weapon;
      weaponShape(this.weapon.clear(), u.weapon, POSTER.cream, POSTER.black);
    }
    if (key === this.key) return;
    this.key = key;
    const p = paws(pose, frame);
    const girth = look(this.face).girth ?? 1;
    const g = this.g.clear();
    tailShape(g, POSTER.black, p.swish, 2.4);
    // The player is printed red with a black rim, so he reads on cream and on the red floor alike.
    if (this.role === 'player') ratShape(g, POSTER.black, girth, 1.16);
    ratShape(g, this.role === 'player' ? POSTER.red : POSTER.black, girth);
    details(g, this.face, POSTER.cream, POSTER.black);
    const arm = (sx: number, sy: number, x: number, y: number) => g.moveTo(sx, sy).lineTo(x, y).stroke({ width: 3.2, color: POSTER.black, cap: 'round' }).circle(x, y, 2).fill(POSTER.black);
    arm(2, -5.5, p.l[0], p.l[1]);
    arm(2, 5.5, p.r[0], p.r[1]);
    // The rebels' white band on the right arm.
    if (band) g.circle(2 + (p.r[0] - 2) * 0.45, 5.5 + (p.r[1] - 5.5) * 0.45, 2.4).fill(POSTER.cream).stroke({ width: 0.7, color: POSTER.black });
    this.weapon.position.set(p.r[0], p.r[1]);
    this.weapon.rotation = p.wa;
    // Frozen at «Смирно!»: a cream outline round him, the one thing that says he can't move.
    this.ring.clear();
    if (u.frozen > 0) this.ring.circle(1, 0, 13).stroke({ width: 1.6, color: POSTER.cream }).circle(1, 0, 14.6).stroke({ width: 0.8, color: POSTER.black });
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** A fallen one, as the poster lays him out (a black silhouette, limbs flung out) or as the truth does (grey paper). */
export function bodyCut(u: Unit, truth: boolean, band: boolean): Container {
  const c = new Container();
  const g = new Graphics();
  const lk = look(u.face);
  const fill = truth ? PAPER.body : u.id === 'player' ? POSTER.red : POSTER.black;
  const line = truth ? PAPER.seam : POSTER.black;
  tailShape(g, truth ? PAPER.seam : POSTER.black, 1.4, 2.4);
  ratShape(g, fill, lk.girth ?? 1);
  if (truth) g.ellipse(0, 0, 9, 6 * (lk.girth ?? 1)).stroke({ width: 0.7, color: line });
  g.moveTo(2, -5.5).lineTo(-1, -14).moveTo(2, 5.5).lineTo(9, 12).stroke({ width: 3, color: truth ? PAPER.body : POSTER.black, cap: 'round' });
  if (!truth) {
    details(g, u.face, POSTER.cream, POSTER.black);
    if (band) g.circle(5.5, 8.6, 2.2).fill(POSTER.cream).stroke({ width: 0.7, color: POSTER.black });
  }
  c.addChild(g);
  c.scale.set(S * lk.size);
  c.position.set(u.x, u.y);
  // He fell the way the blow went.
  c.rotation = u.dir + Math.PI + 0.5;
  return c;
}

/** A standing figure for the truth (lights out): a dark paper cut-out, no colour at all. */
export function standingCut(u: Unit): Container {
  const c = new Container();
  const g = new Graphics();
  tailShape(g, PAPER.cut, 0.3, 2.2);
  ratShape(g, PAPER.cut, look(u.face).girth ?? 1);
  g.ellipse(0, 0, 9, 6).stroke({ width: 0.6, color: 0x1b1815 });
  c.addChild(g);
  c.scale.set(S * look(u.face).size);
  c.position.set(u.x, u.y);
  c.rotation = u.dir;
  return c;
}

/** Blood as the poster prints it: a flat red pool under the body and drops thrown the way the blow went. */
export function splat(g: Graphics, x: number, y: number, dir: number, seed: number, big = 1): void {
  const r = seededRng(seed * 7919 + 3);
  const pts: number[] = [];
  const rad = (20 + r() * 10) * big;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const k = 0.7 + r() * 0.5;
    pts.push(x + Math.cos(dir) * 8 + Math.cos(a) * rad * k, y + Math.sin(dir) * 8 + Math.sin(a) * rad * k * 0.85);
  }
  g.poly(pts).fill(POSTER.red);
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const a = dir + (r() - 0.5) * 0.9;
    const d = rad + 8 + r() * 60 * big;
    const s = 2 + r() * 5;
    g.circle(x + Math.cos(a) * d, y + Math.sin(a) * d, s).fill(POSTER.red);
    if (r() < 0.4) g.moveTo(x + Math.cos(a) * (rad * 0.8), y + Math.sin(a) * (rad * 0.8)).lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d).stroke({ width: 2 + r() * 2, color: POSTER.red, cap: 'round' });
  }
}

// ---------- the rooms ----------

function furniturePoster(g: Graphics, f: Furniture): void {
  const { x, y, w, h } = f;
  switch (f.kind) {
    case 'bunk':
      // From above: the top bunk's mattress, a red blanket, the pillow at the wall.
      g.rect(x, y, w, h).fill(POSTER.cream).stroke({ width: 4, color: POSTER.black });
      g.rect(x + 7, y + (y < 200 ? 46 : 8), w - 14, h - 56).fill(POSTER.red).stroke({ width: 2, color: POSTER.black });
      g.rect(x + 12, y < 200 ? y + 10 : y + h - 34, w - 24, 24).fill(POSTER.cream).stroke({ width: 2, color: POSTER.black });
      break;
    case 'table':
      g.rect(x - 2, y - 12, w + 4, 8).fill(POSTER.black).rect(x - 2, y + h + 4, w + 4, 8).fill(POSTER.black);
      g.rect(x, y, w, h).fill(POSTER.cream).stroke({ width: 4, color: POSTER.black });
      g.rect(x + 10, y + h / 2 - 6, w - 20, 12).fill(POSTER.red);
      break;
    case 'desk':
      g.rect(x, y, w, h).fill(POSTER.black);
      g.rect(x + 8, y + 8, w - 16, h - 16).fill(POSTER.red);
      g.rect(x + 16, y + 20, 26, 34).fill(POSTER.cream).rect(x + 22, y + 70, 30, 24).fill(POSTER.cream);
      g.circle(x + w - 22, y + h - 26, 9).fill(POSTER.cream).stroke({ width: 3, color: POSTER.black });
      break;
    case 'safe':
      g.rect(x, y, w, h).fill(POSTER.black);
      g.circle(x + w / 2, y + h / 2, 12).fill(POSTER.cream).circle(x + w / 2, y + h / 2, 4).fill(POSTER.black);
      break;
    case 'shelf':
      g.rect(x, y, w, h).fill(POSTER.black);
      for (let i = 0; i < 12; i++) g.rect(x + 8 + i * 15.5, y + 6, 9, h - 12).fill(i % 4 === 1 ? POSTER.red : POSTER.cream);
      break;
    case 'tape':
      g.rect(x, y, w, h).fill(POSTER.black);
      g.circle(x + 13, y + h / 2, 8).circle(x + w - 13, y + h / 2, 8).fill(POSTER.cream);
      g.circle(x + 13, y + h / 2, 2.5).circle(x + w - 13, y + h / 2, 2.5).fill(POSTER.black);
      break;
  }
}

function furnitureTruth(g: Graphics, f: Furniture): void {
  const { x, y, w, h } = f;
  if (f.kind === 'bunk') {
    g.rect(x, y, w, h).fill(PAPER.wood);
    g.rect(x + 7, y + 8, w - 14, h - 16).fill(PAPER.mattress);
  } else if (f.kind === 'table' || f.kind === 'desk') g.rect(x, y, w, h).fill(PAPER.wood);
  else g.rect(x, y, w, h).fill(0x3a3430);
}

/** The door we came in by (shut) and the one on (shut until the room is clear). */
function doors(g: Graphics, rm: RoomDef, open: boolean, truth: boolean): void {
  const leaf = truth ? 0x3b3129 : POSTER.red;
  const line = truth ? 0x1b1815 : POSTER.black;
  g.rect(ROOM.left - 2, 226, ROOM.wall + 4, 88).fill(leaf).stroke({ width: 3, color: line });
  const ex = rm.exit;
  if (!ex) return;
  if (open) g.rect(ex.x + 2, ex.y + ex.h, 6, 70).fill(leaf).stroke({ width: 3, color: line });
  else g.rect(ex.x - 2, ex.y, ex.w + 4, ex.h).fill(leaf).stroke({ width: 3, color: line });
}

export interface RoomLayers {
  poster: Container;
  truth: Container;
  /** Blood and bodies are baked into the poster as they come. */
  blood: Graphics;
  bodiesPoster: Container;
  bodiesTruth: Container;
  /** The exit door, redrawn when it opens. */
  doorPoster: Graphics;
  doorTruth: Graphics;
}

/** One room, both layers, with the finish every scene shares (caption band, print, frame; fog, vignette, grain). */
export function buildRoom(rm: RoomDef, index: number): RoomLayers {
  const poster = new Container();
  const truth = new Container();
  // ---- the poster ----
  const floor = new Graphics().rect(0, 0, REF_W, REF_H).fill(POSTER.cream);
  for (let y = ROOM.top + ROOM.wall + 26; y < ROOM.bottom - ROOM.wall; y += 34) floor.rect(ROOM.left + ROOM.wall, y, ROOM.right - ROOM.left - 2 * ROOM.wall, 2).fill(BOARD);
  poster.addChild(floor);
  if (rm.carpet) {
    const c = rm.carpet;
    // A red border round a pale field, so the blood still shows on it.
    const g = new Graphics().rect(c.x, c.y, c.w, c.h).fill(POSTER.red);
    g.rect(c.x + 28, c.y + 28, c.w - 56, c.h - 56).fill(BOARD).stroke({ width: 3, color: POSTER.black });
    for (let x = c.x + 28; x < c.x + c.w - 28; x += 56) g.moveTo(x, c.y + 28).lineTo(x + 28, c.y + c.h / 2).lineTo(x, c.y + c.h - 28);
    g.stroke({ width: 1.5, color: POSTER.cream });
    g.rect(c.x + 10, c.y + 10, c.w - 20, c.h - 20).stroke({ width: 3, color: POSTER.cream }).rect(c.x, c.y, c.w, c.h).stroke({ width: 4, color: POSTER.black });
    poster.addChild(g);
  }
  const blood = new Graphics();
  poster.addChild(blood);
  const furn = new Graphics();
  for (const f of rm.furniture) furniturePoster(furn, f);
  poster.addChild(furn);
  const walls = new Graphics();
  for (const w of rm.walls) walls.rect(w.x, w.y, w.w, w.h).fill(POSTER.black);
  // Brick lines on the mess's stove, so it reads as the stove.
  if (rm.id === 'mess') {
    const st = rm.walls[rm.walls.length - 1]!;
    for (let yy = st.y + 14; yy < st.y + st.h; yy += 14) walls.rect(st.x + 4, yy, st.w - 8, 2).fill(POSTER.cream);
    walls.rect(st.x + st.w / 2 - 14, st.y + st.h - 22, 28, 18).fill(POSTER.red);
  }
  poster.addChild(walls);
  const doorPoster = new Graphics();
  doors(doorPoster, rm, false, false);
  poster.addChild(doorPoster);
  const bodiesPoster = new Container();
  poster.addChild(bodiesPoster);
  poster.addChild(new Graphics().rect(0, CAPTION_TOP, REF_W, REF_H - CAPTION_TOP).fill(POSTER.cream).rect(0, CAPTION_TOP, REF_W, 6).fill(POSTER.black));
  poster.addChild(new Sprite(cached(`speckle${index}`, () => speckleTexture(REF_W, REF_H, 40 + index))));
  poster.addChild(new Graphics().rect(5, 5, REF_W - 10, REF_H - 10).stroke({ width: 10, color: POSTER.black }));

  // ---- the truth ----
  truth.addChild(new Graphics().rect(0, 0, REF_W, REF_H).fill(TRUTH.floor));
  const boards = new Graphics();
  for (let y = ROOM.top + ROOM.wall + 26; y < ROOM.bottom - ROOM.wall; y += 34) boards.rect(ROOM.left + ROOM.wall, y, ROOM.right - ROOM.left - 2 * ROOM.wall, 2).fill(0x2a221a);
  truth.addChild(boards);
  const glow = new Sprite(cached('glow', () => glowTexture(256)));
  glow.anchor.set(0.5);
  glow.position.set(640, 270);
  glow.width = 1400;
  glow.height = 900;
  glow.tint = 0xb9b0a0;
  glow.alpha = 0.22;
  truth.addChild(glow);
  const tf = new Graphics();
  for (const f of rm.furniture) furnitureTruth(tf, f);
  for (const w of rm.walls) tf.rect(w.x, w.y, w.w, w.h).fill(PAPER.wall);
  truth.addChild(tf);
  const doorTruth = new Graphics();
  doors(doorTruth, rm, false, true);
  truth.addChild(doorTruth);
  const bodiesTruth = new Container();
  truth.addChild(bodiesTruth);
  truth.addChild(new Sprite(cached('vignette', () => vignetteTexture(REF_W, REF_H, 0.7))));
  const grain = new TilingSprite({ texture: cached('grain', () => grainTexture(160, 50)), width: REF_W, height: REF_H });
  grain.alpha = 0.14;
  truth.addChild(grain);
  return { poster, truth, blood, bodiesPoster, bodiesTruth, doorPoster, doorTruth };
}

export function openDoor(L: RoomLayers, rm: RoomDef): void {
  doors(L.doorPoster.clear(), rm, true, false);
  doors(L.doorTruth.clear(), rm, true, true);
}

/** A weapon lying on the floor: black, with a thick cream outline so it shows on red too. */
export function itemCut(kind: WeaponKind): Container {
  const c = new Container();
  // A ring round it, as chalk round evidence: black on cream, and on the red too.
  c.addChild(new Graphics().circle(0, 0, 22).fill({ color: POSTER.cream, alpha: 0.85 }).circle(0, 0, 22).stroke({ width: 2.5, color: POSTER.black }));
  const w = new Container();
  w.addChild(weaponShape(new Graphics(), kind, POSTER.cream, POSTER.cream, 2.6), weaponShape(new Graphics(), kind, POSTER.black, POSTER.black, 0.5));
  w.pivot.set(kind === 'stool' || kind === 'mug' ? 4 : kind === 'leg' || kind === 'poker' || kind === 'shovel' ? 9 : 6, 0);
  w.scale.set(S * (kind === 'leg' || kind === 'poker' || kind === 'shovel' ? 0.95 : 1.2));
  c.addChild(w);
  return c;
}

/** The sofa from above: back, seat with two cushions, armrests (the duty's sofa). */
export function sofaCut(r: Rect, truth: boolean): Graphics {
  const g = new Graphics();
  const fill = truth ? 0x564e48 : POSTER.red;
  const line = truth ? 0x2a1f1a : POSTER.black;
  g.rect(0, 0, r.w, r.h).fill(fill).stroke({ width: truth ? 0 : 4, color: line });
  g.rect(0, 0, r.w, 14).fill(truth ? 0x4a433e : POSTER.black);
  g.rect(0, 0, 12, r.h).fill(truth ? 0x4a433e : POSTER.black).rect(r.w - 12, 0, 12, r.h).fill(truth ? 0x4a433e : POSTER.black);
  g.moveTo(r.w / 2, 16).lineTo(r.w / 2, r.h - 4).stroke({ width: 2, color: truth ? 0x3a332e : POSTER.cream });
  return g;
}
