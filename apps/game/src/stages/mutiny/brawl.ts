/**
 * The mutiny brawl's rules as a pure simulation (concept «Бунт: драка с генералом», «Техника»): three rooms of
 * walls and furniture, rats as circles, sight and the general's voice cut by walls (rays), simple states for
 * the general's men (стоит, услышал, бежит, бьёт, лежит), swings, throws and the nagan's shots, the sofa ram,
 * and an instant restart of the room from the checkpoint taken at its door. The whole state is plain JSON, its
 * random generator included, so a room replays exactly; the stage only draws it and feeds it the input.
 */
import { BARKS, MUTINY, ROOM, ROOM_MEN, ROOMS, WEAPONS, type Rect, type RoomDef, type WeaponKind } from '../../content/mutiny.ts';
import { chronicle } from './chronicle.ts';
import type { MutinyResult } from './types.ts';

export const PLAYER = 'player';
export const GENERAL = 'general';
export const KRYPOTKIN = 'krypotkin';
export const SEDOY = 'sedoy';
export const PODVALNY = 'podvalny';

const R = MUTINY.radius;

export type Side = 'player' | 'ally' | 'loyal' | 'neutral' | 'general' | 'krypotkin';
export type Mode = 'idle' | 'alert' | 'chase' | 'windup' | 'recover' | 'follow' | 'waver' | 'sit' | 'flee' | 'gone' | 'cornered' | 'down';

export interface Unit {
  id: string;
  /** The look: a face of the barracks, or 'extra' for a nameless soldier. */
  face: string;
  side: Side;
  /** Trust 1: on the player's side until «Отставить!» sends him to the bunks. */
  waverer: boolean;
  x: number;
  y: number;
  /** Facing, radians (0 is to the right, π/2 down the screen). */
  dir: number;
  mode: Mode;
  /** Seconds left in the current mode (a wind-up, a reaction, a pause to think). */
  timer: number;
  /** Seconds left standing to attention after «…но!». */
  frozen: number;
  weapon: WeaponKind;
  ammo: number;
  target: string | null;
  /** Where a swing is locked once the arm goes up. */
  aim: number;
  cooldown: number;
  /** A pressed attack waiting for the cooldown (the player's). */
  buffered: number;
  /** A path through the room's grid, flat [x, y, …], and when it was found. */
  path: number[];
  pathAt: number;
  /** Home: his post, or where a waverer sits it out. */
  hx: number;
  hy: number;
  killedBy: string | null;
  /** Seconds until he may shout a line again. */
  bark: number;
  /** Moved this step (the drawing's walk cycle). */
  moving: boolean;
}

export interface Item {
  id: number;
  kind: WeaponKind;
  x: number;
  y: number;
  ammo: number;
}

export interface Flying {
  id: number;
  kind: WeaponKind;
  ammo: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  left: number;
  by: string;
}

/** The duty's sofa: the player holds one end, an ally comes to push beside him. */
export interface Sofa extends Rect {
  held: boolean;
  helper: string | null;
  attached: boolean;
  /** Where the player (and the helper) stand relative to the sofa's corner while pushing. */
  ox: number;
  oy: number;
  hx: number;
  hy: number;
  speed: number;
}

export interface Shout {
  kind: 'attention' | 'cancel';
  x: number;
  y: number;
  /** Seconds of «Смир-…» left before «…но!». */
  t: number;
}

export interface Aim {
  x: number;
  y: number;
  dir: number;
  t: number;
}

export interface Stats {
  /** The player's kills, and with what. */
  kills: number;
  byWeapon: Partial<Record<WeaponKind | 'sofa', number>>;
  allyKills: number;
  alliesLost: string[];
  loyalLost: string[];
  neutralLost: string[];
  /** Times the player stood frozen by «Смирно!», and shouts the music drowned. */
  frozen: number;
  drowned: number;
  wavered: string[];
  rejoined: string[];
  turned: string[];
  sofaKills: number;
  /** The player took the nagan. */
  revolver: boolean;
  krypotkin: 'player' | 'ally' | 'loyal' | 'general' | null;
  skipped: boolean;
  tape: boolean;
}

export interface BrawlSetup {
  allies: string[];
  waverers: string[];
  loyal: string[];
  krypotkin: boolean;
  seed: number;
  /** «Без спешки» from the start (the player asked for «без таймера»). */
  slow?: boolean;
}

export type Phase = 'fight' | 'dead' | 'exit' | 'final';

export interface Brawl {
  setup: BrawlSetup;
  room: number;
  phase: Phase;
  /** Seconds of the whole brawl, and of this attempt at the room. */
  time: number;
  roomTime: number;
  units: Unit[];
  items: Item[];
  flying: Flying[];
  sofa: Sofa | null;
  shout: Shout | null;
  shoutCd: number;
  /** «Отставить!» was given in this room. */
  cancelled: boolean;
  aim: Aim | null;
  shotCd: number;
  shots: number;
  tape: boolean;
  slow: boolean;
  exitOpen: boolean;
  /** The first «Смирно!» of the brawl was given (an ally shouts for the tape recorder). */
  shouted: boolean;
  greeted: boolean;
  /** Deaths of the player in each room. */
  deaths: number[];
  /** The faces of the general's men in each room ('extra' for nameless ones). */
  men: string[][];
  sedoy: boolean;
  stats: Stats;
  rng: number;
  nextId: number;
  /** The room as it was entered: a restart goes back to it. */
  checkpoint: string;
}

export interface Input {
  /** Movement, each axis -1..1. */
  mx: number;
  my: number;
  /** Where the player aims, in room coordinates; null to face the way he moves. */
  ax: number | null;
  ay: number | null;
  /** Pressed since the last step. */
  attack: boolean;
  throw: boolean;
  use: boolean;
}

export const IDLE_INPUT: Input = { mx: 0, my: 0, ax: null, ay: null, attack: false, throw: false, use: false };

export type Ev =
  | { t: 'windup'; id: string }
  | { t: 'swing'; id: string; weapon: WeaponKind; hit: boolean }
  | { t: 'kill'; id: string; by: string; weapon: WeaponKind | 'sofa'; x: number; y: number; dir: number }
  | { t: 'disarm'; x: number; y: number }
  | { t: 'throw'; id: string; weapon: WeaponKind }
  | { t: 'land'; x: number; y: number; weapon: WeaponKind }
  | { t: 'aim'; x: number; y: number; dir: number }
  | { t: 'shot'; by: string; x1: number; y1: number; x2: number; y2: number }
  | { t: 'empty' }
  | { t: 'shout'; kind: Shout['kind']; x: number; y: number }
  | { t: 'heard'; kind: Shout['kind']; ids: string[]; drowned: boolean }
  | { t: 'bark'; id: string; text: string }
  | { t: 'pick'; weapon: WeaponKind }
  | { t: 'tape' }
  | { t: 'grab'; on: boolean; helper: boolean }
  | { t: 'clear' }
  | { t: 'gone' }
  | { t: 'cornered' }
  | { t: 'exit' }
  | { t: 'final' }
  | { t: 'dead' };

// ---------- small geometry ----------

const hyp = (dx: number, dy: number) => Math.sqrt(dx * dx + dy * dy);
export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => hyp(a.x - b.x, a.y - b.y);
const angleTo = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x);

/** The difference of two angles, -π..π. */
export function turn(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Where the segment (x1,y1)→(x2,y2) first enters the rect grown by pad, as 0..1 along it; null if it misses. */
export function segRect(x1: number, y1: number, x2: number, y2: number, r: Rect, pad = 0): number | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - (r.x - pad), r.x + r.w + pad - x1, y1 - (r.y - pad), r.y + r.h + pad - y1];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    const pi = p[i]!;
    const qi = q[i]!;
    if (pi === 0) {
      if (qi < 0) return null;
      continue;
    }
    const t = qi / pi;
    if (pi < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return t0;
}

/** Where the segment first touches a circle, 0..1; null if it misses. */
function segCircle(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, r: number): number | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a === 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

export function room(b: Brawl): RoomDef {
  return ROOMS[b.room]!;
}

/** The exit door while it is shut. */
function door(b: Brawl): Rect | null {
  const ex = room(b).exit;
  return ex && !b.exitOpen ? ex : null;
}

type Block = 'move' | 'sight' | 'sound' | 'shot';

/**
 * What stops what: walls stop everything; tall furniture stops feet, eyes, throws and bullets but never the
 * voice; low furniture stops only feet; the sofa stops feet and bullets.
 */
export function blockers(b: Brawl, what: Block): Rect[] {
  const rm = room(b);
  const out: Rect[] = [...rm.walls];
  const d = door(b);
  if (d) out.push(d);
  if (what === 'sound') return out;
  for (const f of rm.furniture) if (what === 'move' || f.tall) out.push(f);
  if (b.sofa && (what === 'move' || what === 'shot')) out.push(b.sofa);
  return out;
}

/** Nothing of that kind stands between the two points. */
export function clear(b: Brawl, x1: number, y1: number, x2: number, y2: number, what: Block, pad = 0): boolean {
  for (const r of blockers(b, what)) if (segRect(x1, y1, x2, y2, r, pad) !== null) return false;
  return true;
}

/** How far a ray goes from (x, y) before something of that kind stops it (the voice's reach, drawn as a circle). */
export function reach(b: Brawl, x: number, y: number, angle: number, max: number, what: Block): number {
  const x2 = x + Math.cos(angle) * max;
  const y2 = y + Math.sin(angle) * max;
  let t = 1;
  for (const r of blockers(b, what)) {
    const hit = segRect(x, y, x2, y2, r);
    if (hit !== null && hit < t) t = hit;
  }
  return t * max;
}

/** Pushes a circle out of a rect; true if it was inside. */
function pushOut(u: { x: number; y: number }, r: Rect, rad: number): boolean {
  const cx = Math.max(r.x, Math.min(u.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(u.y, r.y + r.h));
  const dx = u.x - cx;
  const dy = u.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rad * rad) return false;
  if (d2 === 0) {
    // The centre is inside: out by the nearest side.
    const sides = [u.x - r.x, r.x + r.w - u.x, u.y - r.y, r.y + r.h - u.y];
    const i = sides.indexOf(Math.min(...sides));
    if (i === 0) u.x = r.x - rad;
    else if (i === 1) u.x = r.x + r.w + rad;
    else if (i === 2) u.y = r.y - rad;
    else u.y = r.y + r.h + rad;
    return true;
  }
  const d = Math.sqrt(d2);
  u.x = cx + (dx / d) * rad;
  u.y = cy + (dy / d) * rad;
  return true;
}

function move(b: Brawl, u: Unit, vx: number, vy: number, dt: number): void {
  u.x += vx * dt;
  u.y += vy * dt;
  for (const r of blockers(b, 'move')) pushOut(u, r, R);
  u.moving = vx !== 0 || vy !== 0;
}

/** Distance from a point to a rect's edge (0 inside). */
function toRect(x: number, y: number, r: Rect): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return hyp(dx, dy);
}

// ---------- the random generator (mulberry32 on the brawl's own state, as in core/battle.ts) ----------

export function random(b: Brawl): number {
  b.rng = (b.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(b.rng ^ (b.rng >>> 15), 1 | b.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const pick = <T>(b: Brawl, list: readonly T[]): T => list[Math.floor(random(b) * list.length)]!;

// ---------- the grid the general's men find their way by ----------

const CELL = 20;
const GW = Math.ceil(1280 / CELL);
const GH = Math.ceil(540 / CELL);
const grids = new Map<number, Uint8Array>();

/** Cells a rat can stand in, per room (walls and furniture only; the sofa just shoves). */
function grid(roomIndex: number): Uint8Array {
  const cached = grids.get(roomIndex);
  if (cached) return cached;
  const rm = ROOMS[roomIndex]!;
  const g = new Uint8Array(GW * GH);
  const rects = [...rm.walls, ...rm.furniture];
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const x = i * CELL + CELL / 2;
      const y = j * CELL + CELL / 2;
      const inside = x > ROOM.left + ROOM.wall && x < ROOM.right - ROOM.wall && y > ROOM.top + ROOM.wall && y < ROOM.bottom - ROOM.wall;
      g[j * GW + i] = inside && rects.every((r) => toRect(x, y, r) >= R - 2) ? 1 : 0;
    }
  grids.set(roomIndex, g);
  return g;
}

const cellOf = (x: number, y: number) => Math.max(0, Math.min(GW - 1, Math.floor(x / CELL))) + Math.max(0, Math.min(GH - 1, Math.floor(y / CELL))) * GW;

/** The nearest open cell to a point (the point itself is often against furniture). */
function openCell(g: Uint8Array, x: number, y: number): number {
  const c = cellOf(x, y);
  if (g[c]) return c;
  let best = -1;
  let bestD = Infinity;
  const ci = c % GW;
  const cj = Math.floor(c / GW);
  for (let dj = -3; dj <= 3; dj++)
    for (let di = -3; di <= 3; di++) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= GW || j >= GH || !g[j * GW + i]) continue;
      const d = di * di + dj * dj;
      if (d < bestD) {
        bestD = d;
        best = j * GW + i;
      }
    }
  return best;
}

/** A path of cell centres from one point to another (breadth-first over eight neighbours, no corner cutting). */
export function findPath(roomIndex: number, sx: number, sy: number, tx: number, ty: number): number[] {
  const g = grid(roomIndex);
  const start = openCell(g, sx, sy);
  const goal = openCell(g, tx, ty);
  if (start < 0 || goal < 0) return [];
  const prev = new Int32Array(GW * GH).fill(-1);
  prev[start] = start;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi]!;
    if (c === goal) break;
    const ci = c % GW;
    const cj = Math.floor(c / GW);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
        const n = j * GW + i;
        if (!g[n] || prev[n]! >= 0) continue;
        if (di && dj && (!g[cj * GW + i] || !g[j * GW + ci])) continue;
        prev[n] = c;
        queue.push(n);
      }
  }
  if (prev[goal]! < 0) return [];
  const cells: number[] = [];
  for (let c = goal; c !== start; c = prev[c]!) cells.push(c);
  const out: number[] = [];
  for (let k = cells.length - 1; k >= 0; k--) {
    const c = cells[k]!;
    out.push((c % GW) * CELL + CELL / 2, Math.floor(c / GW) * CELL + CELL / 2);
  }
  if (out.length) {
    out[out.length - 2] = tx;
    out[out.length - 1] = ty;
  }
  return out;
}

/** Walks a unit toward a point: straight when nothing is in the way, along the grid otherwise. */
function steer(b: Brawl, u: Unit, tx: number, ty: number, speed: number, dt: number): void {
  let gx = tx;
  let gy = ty;
  if (!clear(b, u.x, u.y, tx, ty, 'move', R - 3)) {
    if (!u.path.length || b.roomTime - u.pathAt > 0.4) {
      u.path = findPath(b.room, u.x, u.y, tx, ty);
      u.pathAt = b.roomTime;
    }
    // Skip waypoints already in a straight line.
    while (u.path.length >= 4 && clear(b, u.x, u.y, u.path[2]!, u.path[3]!, 'move', R - 3)) u.path.splice(0, 2);
    if (u.path.length >= 2 && hyp(u.path[0]! - u.x, u.path[1]! - u.y) < 6) u.path.splice(0, 2);
    if (u.path.length >= 2) {
      gx = u.path[0]!;
      gy = u.path[1]!;
    }
  } else u.path = [];
  const d = hyp(gx - u.x, gy - u.y);
  if (d < 1) {
    u.moving = false;
    return;
  }
  const v = Math.min(speed, d / dt);
  u.dir = Math.atan2(gy - u.y, gx - u.x);
  move(b, u, ((gx - u.x) / d) * v, ((gy - u.y) / d) * v, dt);
}

// ---------- who stands where ----------

/**
 * The sides as the concept fixes them, whatever trust says: Подвальный is always with the general, Седой sits
 * on the bunks and takes no side; the player, the general and Крыпоткин are not soldiers to share out.
 */
export function sides(setup: Pick<BrawlSetup, 'allies' | 'waverers' | 'loyal'>): { allies: string[]; waverers: string[]; loyal: string[]; sedoy: boolean } {
  const special = new Set([PLAYER, GENERAL, KRYPOTKIN, SEDOY, PODVALNY]);
  const taken = new Set<string>();
  const take = (list: string[]) =>
    list.filter((f) => {
      if (special.has(f) || taken.has(f)) return false;
      taken.add(f);
      return true;
    });
  const all = [...setup.allies, ...setup.waverers, ...setup.loyal];
  const allies = take(setup.allies);
  const waverers = take(setup.waverers);
  const loyal = take(setup.loyal);
  if (all.includes(PODVALNY)) loyal.push(PODVALNY);
  return { allies, waverers, loyal, sedoy: all.includes(SEDOY) };
}

/**
 * Shares the general's men out among the rooms: the bedroom first (the ones the player carried the sofa with,
 * if the runner lists them first), then the mess, then the office, where Подвальный stands by the general;
 * nameless soldiers fill the places nobody named takes.
 */
export function muster(loyal: readonly string[]): string[][] {
  const named = loyal.filter((f) => f !== PODVALNY);
  const rooms: string[][] = [[], [], []];
  const podvalny = loyal.includes(PODVALNY);
  const want = ROOM_MEN.map((n, i) => (i === 2 && podvalny ? n - 1 : n));
  const spots = ROOMS.map((r) => r.loyalSpots.length);
  for (let i = 0; i < 3; i++) while (named.length && rooms[i]!.length < want[i]!) rooms[i]!.push(named.shift()!);
  for (let i = 0; i < 3; i++) while (named.length && rooms[i]!.length < spots[i]!) rooms[i]!.push(named.shift()!);
  for (let i = 0; i < 3; i++) while (rooms[i]!.length < want[i]!) rooms[i]!.push('extra');
  if (podvalny) rooms[2]!.push(PODVALNY);
  return rooms;
}

function unit(id: string, face: string, side: Side, x: number, y: number, dir: number, weapon: WeaponKind, mode: Mode): Unit {
  return { id, face, side, waverer: false, x, y, dir, mode, timer: 0, frozen: 0, weapon, ammo: 0, target: null, aim: dir, cooldown: 0, buffered: 0, path: [], pathAt: -1, hx: x, hy: y, killedBy: null, bark: 0, moving: false };
}

export function find(b: Brawl, id: string): Unit | undefined {
  return b.units.find((u) => u.id === id);
}

export function player(b: Brawl): Unit {
  return find(b, PLAYER)!;
}

export const alive = (u: Unit) => u.mode !== 'down' && u.mode !== 'gone';
const ours = (u: Unit) => alive(u) && (u.side === 'player' || u.side === 'ally');
const theirs = (u: Unit) => alive(u) && u.side === 'loyal';

const ALLY_WEAPONS: readonly WeaponKind[] = ['stool', 'fists', 'leg', 'fists'];

export function newBrawl(setup: BrawlSetup): Brawl {
  const s = sides(setup);
  const b: Brawl = {
    setup: { ...setup, allies: s.allies, waverers: s.waverers, loyal: s.loyal },
    room: 0,
    phase: 'fight',
    time: 0,
    roomTime: 0,
    units: [],
    items: [],
    flying: [],
    sofa: null,
    shout: null,
    shoutCd: 0,
    cancelled: false,
    aim: null,
    shotCd: 0,
    shots: 0,
    tape: false,
    slow: setup.slow === true,
    exitOpen: false,
    shouted: false,
    greeted: false,
    deaths: [0, 0, 0],
    men: muster(s.loyal),
    sedoy: s.sedoy,
    stats: { kills: 0, byWeapon: {}, allyKills: 0, alliesLost: [], loyalLost: [], neutralLost: [], frozen: 0, drowned: 0, wavered: [], rejoined: [], turned: [], sofaKills: 0, revolver: false, krypotkin: null, skipped: false, tape: false },
    rng: setup.seed | 0,
    nextId: 1,
    checkpoint: '',
  };
  enterRoom(b, 0);
  return b;
}

/**
 * Builds a room as the player comes in: the allies still standing come with him, the general's men of this
 * room at their posts, the general by the far door (or behind his desk) with what ammunition he has left.
 * The state at the door is the room's checkpoint.
 */
export function enterRoom(b: Brawl, index: number, opts: { empty?: boolean } = {}): void {
  const prev = b.units;
  const rm = ROOMS[index]!;
  const p0 = prev.find((u) => u.id === PLAYER);
  const g0 = prev.find((u) => u.id === GENERAL);
  const k0 = prev.find((u) => u.id === KRYPOTKIN);
  b.room = index;
  b.phase = 'fight';
  b.roomTime = 0;
  b.items = rm.items.map(([kind, x, y]) => ({ id: b.nextId++, kind, x, y, ammo: 0 }));
  b.flying = [];
  b.shout = null;
  b.shoutCd = MUTINY.firstShout;
  b.cancelled = false;
  b.aim = null;
  b.shotCd = MUTINY.firstShot;
  b.exitOpen = false;
  b.greeted = false;
  b.sofa = rm.sofa ? { ...rm.sofa, held: false, helper: null, attached: false, ox: 0, oy: 0, hx: 0, hy: 0, speed: 0 } : null;

  const units: Unit[] = [];
  const p = unit(PLAYER, PLAYER, 'player', rm.entry[0], rm.entry[1], 0, p0?.weapon ?? 'pen', 'idle');
  p.ammo = p0?.ammo ?? 0;
  units.push(p);
  // The party: at the first door everyone trust put beside the player; later, whoever of them still stands.
  const party: { id: string; face: string; waverer: boolean; weapon: WeaponKind }[] = p0
    ? prev.filter((u) => u.side === 'ally' && alive(u)).map((u) => ({ id: u.id, face: u.face, waverer: u.waverer, weapon: u.weapon }))
    : [...b.setup.allies.map((f) => ({ f, w: false })), ...b.setup.waverers.map((f) => ({ f, w: true }))].map(({ f, w }, i) => ({ id: f, face: f, waverer: w, weapon: ALLY_WEAPONS[i % ALLY_WEAPONS.length]! }));
  party.forEach((a, i) => {
    const spot = rm.allySpots[i % rm.allySpots.length]!;
    const ring = Math.floor(i / rm.allySpots.length);
    const u = unit(a.id, a.face, 'ally', spot[0] + ring * 40, spot[1], 0, a.weapon, 'follow');
    u.waverer = a.waverer;
    units.push(u);
  });
  if (index === 0 && b.sedoy && rm.sedoy) units.push(unit(SEDOY, SEDOY, 'neutral', rm.sedoy[0], rm.sedoy[1], rm.sedoy[2], 'fists', 'sit'));
  if (!opts.empty) {
    let extra = 0;
    b.men[index]!.forEach((face, i) => {
      const pod = face === PODVALNY && rm.podvalny !== undefined;
      const base = rm.loyalSpots[i % rm.loyalSpots.length]!;
      const ring = pod ? 0 : Math.floor(i / rm.loyalSpots.length);
      const [x, y, dir] = pod ? rm.podvalny! : base;
      const id = face === 'extra' ? `extra${index}-${extra++}` : face;
      units.push(unit(id, face, 'loyal', x - ring * 44, y, dir, pod ? 'fists' : base[3], 'idle'));
    });
  }
  const g = unit(GENERAL, GENERAL, 'general', rm.general[0], rm.general[1], Math.PI, g0 ? g0.weapon : 'nagan', 'idle');
  g.ammo = g0 ? g0.ammo : MUTINY.ammo;
  units.push(g);
  const kAlive = index === 1 ? b.setup.krypotkin : index === 2 && k0 !== undefined && alive(k0);
  if (kAlive && !opts.empty) {
    const at = index === 1 && rm.krypotkin ? rm.krypotkin : ([rm.entry[0] + 70, rm.entry[1]] as const);
    units.push(unit(KRYPOTKIN, KRYPOTKIN, 'krypotkin', at[0], at[1], Math.PI / 2, 'fists', 'idle'));
  }
  b.units = units;
  b.checkpoint = snapshot(b);
}

function snapshot(b: Brawl): string {
  return JSON.stringify({ ...b, checkpoint: '' });
}

/** Back to the room's door, instantly: what the brawl remembers across attempts stays (deaths, the music, the pace). */
export function restartRoom(b: Brawl): void {
  const keep = { deaths: [...b.deaths], time: b.time, tape: b.tape, slow: b.slow, stats: { tape: b.stats.tape, frozen: b.stats.frozen, drowned: b.stats.drowned }, checkpoint: b.checkpoint };
  const saved = JSON.parse(b.checkpoint) as Brawl;
  Object.assign(b, saved, keep, { stats: { ...saved.stats, ...keep.stats } });
}

/** «Если не выходит»: what the room offers after so many deaths in it. */
export function offers(b: Brawl): { slow: boolean; skip: boolean } {
  const d = b.deaths[b.room] ?? 0;
  return { slow: d >= MUTINY.slowAfter && !b.slow, skip: d >= MUTINY.skipAfter && b.phase !== 'final' };
}

export function setSlow(b: Brawl, on: boolean): void {
  b.slow = on;
}

/** The skip: straight to the office, the general in his corner without a cartridge, the choice left to the player. */
export function skipToFinal(b: Brawl): void {
  enterRoom(b, 2, { empty: true });
  const rm = room(b);
  const g = find(b, GENERAL)!;
  const corner = rm.corner ?? rm.general;
  g.x = corner[0];
  g.y = corner[1];
  g.weapon = 'fists';
  g.ammo = 0;
  g.mode = 'cornered';
  const p = player(b);
  p.x = corner[0] - 120;
  p.y = corner[1] - 60;
  p.dir = angleTo(p, g);
  g.dir = angleTo(g, p);
  b.stats.skipped = true;
  b.phase = 'final';
}

/** What the runner gets back: how it ended, who struck Крыпоткин, and the chronicle (none if the player gave in). */
export function resultOf(b: Brawl, outcome: MutinyResult['outcome']): MutinyResult {
  return {
    outcome,
    krypotkinKilledBy: b.stats.krypotkin,
    deaths: b.deaths.reduce((a, c) => a + c, 0),
    tapeUsed: b.stats.tape,
    chronicle: outcome === 'surrendered' ? [] : chronicle(b.stats, outcome),
    seconds: Math.round(b.time),
  };
}

// ---------- one step ----------

/** Advances the brawl by dt seconds of its own clock (the stage scales it for «без спешки») and says what happened. */
export function step(b: Brawl, dt: number, input: Input): Ev[] {
  const ev: Ev[] = [];
  if (b.phase !== 'fight') return ev;
  b.time += dt;
  b.roomTime += dt;
  b.shoutCd -= dt;
  b.shotCd -= dt;
  if (!b.greeted && b.roomTime > 0.3) greet(b, ev);
  for (const u of b.units) {
    u.moving = false;
    u.bark -= dt;
  }
  playerStep(b, player(b), dt, input, ev);
  for (const u of b.units) {
    if (u.id === PLAYER || !alive(u)) continue;
    if (u.frozen > 0) {
      u.frozen = Math.max(0, u.frozen - dt);
      continue;
    }
    if (u.side === 'general') generalStep(b, u, dt, ev);
    else if (u.side === 'krypotkin') krypotkinStep(b, u, dt, ev);
    else if (u.side === 'ally') allyStep(b, u, dt, ev);
    else if (u.side === 'loyal') loyalStep(b, u, dt, ev);
    else if (u.mode === 'waver' || u.mode === 'sit') waverStep(b, u, dt, ev);
  }
  flyStep(b, dt, ev);
  shoutStep(b, dt, ev);
  aimStep(b, dt, ev);
  separate(b);
  if (b.phase === 'fight' && room(b).exit && !b.exitOpen && !b.units.some(theirs)) {
    b.exitOpen = true;
    ev.push({ t: 'clear' });
  }
  return ev;
}

function greet(b: Brawl, ev: Ev[]): void {
  b.greeted = true;
  const allies = b.units.filter((u) => u.side === 'ally');
  if (b.room === 0 && allies.length) say(b, allies[0]!, pick(b, BARKS.start), ev);
  const pod = find(b, PODVALNY);
  if (pod && alive(pod)) say(b, pod, BARKS.podvalny, ev);
}

function say(b: Brawl, u: Unit, text: string, ev: Ev[], pause = 3): void {
  if (u.bark > 0) return;
  u.bark = pause;
  ev.push({ t: 'bark', id: u.id, text });
}

// ---------- the player ----------

function playerStep(b: Brawl, p: Unit, dt: number, input: Input, ev: Ev[]): void {
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.buffered = Math.max(0, p.buffered - dt);
  if (input.attack) p.buffered = MUTINY.buffer;
  if (p.frozen > 0) {
    p.frozen = Math.max(0, p.frozen - dt);
    return;
  }
  if (p.mode === 'windup') {
    p.timer -= dt;
    if (p.timer <= 0) {
      p.mode = 'idle';
      swing(b, p, p.aim, ev);
    }
  }
  const len = hyp(input.mx, input.my);
  if (input.ax !== null && input.ay !== null) p.dir = Math.atan2(input.ay - p.y, input.ax - p.x);
  else if (len > 0.1) p.dir = Math.atan2(input.my, input.mx);
  if (input.use) use(b, p, ev);
  if (input.throw && p.weapon !== 'fists') {
    letGo(b, ev);
    throwIt(b, p, p.dir, ev);
  }
  if (p.buffered > 0 && p.cooldown <= 0 && p.mode !== 'windup') {
    p.buffered = 0;
    letGo(b, ev);
    if (p.weapon === 'nagan' && p.ammo > 0) {
      shoot(b, p, p.dir, ev);
      p.cooldown = WEAPONS.nagan.cooldown;
    } else {
      p.mode = 'windup';
      p.timer = MUTINY.playerWindup;
      p.aim = p.dir;
      p.cooldown = WEAPONS[p.weapon].cooldown;
    }
  }
  if (b.sofa?.held) push(b, p, input, dt, ev);
  else if (len > 0.1) {
    const k = (Math.min(1, len) / len) * MUTINY.playerSpeed;
    move(b, p, input.mx * k, input.my * k, dt);
  }
  const ex = room(b).exit;
  if (ex && b.exitOpen && p.x > ex.x + 2 && b.phase === 'fight') {
    b.phase = 'exit';
    ev.push({ t: 'exit' });
  }
}

/** E: let go of the sofa, turn the tape recorder on, pick up what lies at the feet, or take hold of the sofa. */
function use(b: Brawl, p: Unit, ev: Ev[]): void {
  if (b.sofa?.held) {
    letGo(b, ev);
    return;
  }
  const tape = room(b).tape;
  if (tape && !b.tape && hyp(p.x - tape[0], p.y - tape[1]) <= MUTINY.useRange) {
    b.tape = true;
    b.stats.tape = true;
    ev.push({ t: 'tape' });
    return;
  }
  let best: Item | null = null;
  let bestD: number = MUTINY.pickRange;
  for (const it of b.items) {
    const d = dist(p, it);
    if (d <= bestD) {
      best = it;
      bestD = d;
    }
  }
  if (best) {
    b.items.splice(b.items.indexOf(best), 1);
    if (p.weapon !== 'fists') b.items.push({ id: b.nextId++, kind: p.weapon, x: p.x, y: p.y, ammo: p.ammo });
    p.weapon = best.kind;
    p.ammo = best.ammo;
    if (best.kind === 'nagan' && best.ammo > 0) b.stats.revolver = true;
    ev.push({ t: 'pick', weapon: best.kind });
    return;
  }
  if (b.sofa && toRect(p.x, p.y, b.sofa) <= R + 14) grab(b, p, ev);
}

// ---------- the sofa ----------

function grab(b: Brawl, p: Unit, ev: Ev[]): void {
  const s = b.sofa!;
  s.held = true;
  s.ox = p.x - s.x;
  s.oy = p.y - s.y;
  // The helper stands beside the player along the same side of the sofa.
  const alongX = p.y < s.y || p.y > s.y + s.h;
  const step = 38;
  const sign = alongX ? (s.ox + step < s.w ? 1 : -1) : s.oy + step < s.h ? 1 : -1;
  s.hx = alongX ? s.ox + sign * step : s.ox;
  s.hy = alongX ? s.oy : s.oy + sign * step;
  const helper = b.units.filter((u) => u.side === 'ally' && alive(u) && u.frozen <= 0).sort((a, c) => dist(a, p) - dist(c, p))[0];
  s.helper = helper?.id ?? null;
  s.attached = false;
  ev.push({ t: 'grab', on: true, helper: s.helper !== null });
}

function letGo(b: Brawl, ev: Ev[]): void {
  const s = b.sofa;
  if (!s?.held) return;
  s.held = false;
  s.helper = null;
  s.attached = false;
  s.speed = 0;
  ev.push({ t: 'grab', on: false, helper: false });
}

/**
 * Pushing (or dragging) the sofa: alone it barely budges; with the ally at his place beside the player it goes
 * fast, and at speed it crushes whoever it hits — the duty «диван на два шага влево» finally of use.
 */
function push(b: Brawl, p: Unit, input: Input, dt: number, ev: Ev[]): void {
  const s = b.sofa!;
  const len = hyp(input.mx, input.my);
  const helper = s.helper ? find(b, s.helper) : undefined;
  if (s.helper && (!helper || !alive(helper) || helper.frozen > 0)) {
    s.helper = null;
    s.attached = false;
  }
  const speed = s.attached ? MUTINY.sofaTwo : MUTINY.sofaAlone;
  s.speed = 0;
  if (len > 0.1) {
    const k = Math.min(1, len) / len;
    const vx = input.mx * k * speed;
    const vy = input.my * k * speed;
    const walls = blockers(b, 'move').filter((r) => r !== s);
    // Move along each axis unless the sofa (or the pushers) would run into the room.
    const fits = (nx: number, ny: number) =>
      walls.every((r) => !(nx < r.x + r.w && nx + s.w > r.x && ny < r.y + r.h && ny + s.h > r.y)) &&
      walls.every((r) => toRect(nx + s.ox, ny + s.oy, r) >= R) &&
      (!s.attached || walls.every((r) => toRect(nx + s.hx, ny + s.hy, r) >= R));
    const x0 = s.x;
    const y0 = s.y;
    if (fits(s.x + vx * dt, s.y)) s.x += vx * dt;
    if (fits(s.x, s.y + vy * dt)) s.y += vy * dt;
    const moved = hyp(s.x - x0, s.y - y0);
    s.speed = moved / dt;
    p.moving = moved > 0;
    if (s.speed >= MUTINY.sofaCrush) {
      const dir = Math.atan2(s.y - y0, s.x - x0);
      for (const u of b.units) {
        if (u === p || u.id === s.helper || !alive(u) || u.side === 'ally') continue;
        if (toRect(u.x, u.y, s) < R - 2) {
          if (u.side === 'general') disarm(b, u, ev);
          else kill(b, u, PLAYER, 'sofa', dir, ev);
        }
      }
    }
  }
  p.x = s.x + s.ox;
  p.y = s.y + s.oy;
  if (helper && alive(helper) && s.attached) {
    helper.x = s.x + s.hx;
    helper.y = s.y + s.hy;
    helper.dir = p.dir;
    helper.moving = p.moving;
  }
}

// ---------- blows, throws, shots ----------

/** Who a blow from a may land on: the player and his allies never hit each other; the general's men never hit theirs. */
function canHit(a: Unit, v: Unit): boolean {
  if (a === v || !alive(v)) return false;
  if (a.side === 'player') return v.side !== 'ally';
  if (a.side === 'ally') return v.side === 'loyal' || v.side === 'krypotkin';
  if (a.side === 'loyal') return v.side === 'player' || v.side === 'ally' || v.side === 'krypotkin';
  return false;
}

/** How close an NPC goes before he raises his arm, and how far a blow lands, centre to centre. */
const swingFrom = (w: WeaponKind) => 2 * R + WEAPONS[w].reach - 10;
const landsAt = (w: WeaponKind) => 2 * R + WEAPONS[w].reach - 2;

/** A swing: the nearest one in the arc falls (any blow kills); the general only loses his gun. */
function swing(b: Brawl, u: Unit, dir: number, ev: Ev[]): void {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const v of b.units) {
    if (!canHit(u, v)) continue;
    const d = dist(u, v);
    if (d > landsAt(u.weapon)) continue;
    const off = Math.abs(turn(dir, angleTo(u, v)));
    if (off > (d < 2 * R + 6 ? Math.PI / 2 : MUTINY.arc)) continue;
    // Крыпоткин catches a blow meant for another only when he is squarely in its way.
    if (v.side === 'krypotkin' && u.side !== 'player' && off > MUTINY.arc / 2) continue;
    if (!clear(b, u.x, u.y, v.x, v.y, 'shot')) continue;
    if (d < bestD) {
      best = v;
      bestD = d;
    }
  }
  ev.push({ t: 'swing', id: u.id, weapon: u.weapon, hit: best !== null });
  if (!best) return;
  if (best.side === 'general') disarm(b, best, ev);
  else kill(b, best, u.id, u.weapon, dir, ev);
}

function kill(b: Brawl, v: Unit, by: string, weapon: WeaponKind | 'sofa', dir: number, ev: Ev[]): void {
  if (!alive(v)) return;
  v.mode = 'down';
  v.killedBy = by;
  v.frozen = 0;
  const killer = find(b, by);
  ev.push({ t: 'kill', id: v.id, by, weapon, x: v.x, y: v.y, dir });
  const st = b.stats;
  if (by === PLAYER) {
    st.kills++;
    st.byWeapon[weapon] = (st.byWeapon[weapon] ?? 0) + 1;
    if (weapon === 'sofa') st.sofaKills++;
  } else if (killer?.side === 'ally') st.allyKills++;
  if (v.side === 'ally') st.alliesLost.push(v.face);
  else if (v.side === 'loyal') st.loyalLost.push(v.face);
  else if (v.side === 'neutral') st.neutralLost.push(v.face);
  else if (v.side === 'krypotkin') st.krypotkin = by === PLAYER ? 'player' : killer?.side === 'ally' ? 'ally' : killer?.side === 'general' ? 'general' : 'loyal';
  if (v.weapon !== 'fists' && v.id !== PLAYER) b.items.push({ id: b.nextId++, kind: v.weapon, x: v.x, y: v.y, ammo: v.ammo });
  if (b.sofa?.held && (v.id === PLAYER || v.id === b.sofa.helper)) letGo(b, ev);
  if (v.id === PLAYER) {
    b.phase = 'dead';
    b.deaths[b.room] = (b.deaths[b.room] ?? 0) + 1;
    ev.push({ t: 'dead' });
    return;
  }
  // A fight is heard: the general's men near it turn to it.
  for (const u of b.units) {
    if (u.side !== 'loyal' || u.mode !== 'idle' || u.frozen > 0) continue;
    if (dist(u, v) <= MUTINY.hear && clear(b, u.x, u.y, v.x, v.y, 'sound')) alert(b, u, killer && killer.side !== 'loyal' ? killer : nearestOf(b, u, ours));
  }
}

/** The general is never killed in the fight itself: a blow knocks the nagan out of his hand. */
function disarm(b: Brawl, g: Unit, ev: Ev[]): void {
  if (g.weapon === 'nagan') {
    const away = angleTo(player(b), g);
    b.items.push({ id: b.nextId++, kind: 'nagan', x: g.x + Math.cos(away) * 26, y: g.y + Math.sin(away) * 26, ammo: g.ammo });
    g.weapon = 'fists';
    g.ammo = 0;
    if (b.aim) b.aim = null;
  }
  ev.push({ t: 'disarm', x: g.x, y: g.y });
}

function throwIt(b: Brawl, u: Unit, dir: number, ev: Ev[]): void {
  b.flying.push({ id: b.nextId++, kind: u.weapon, ammo: u.ammo, x: u.x + Math.cos(dir) * (R + 4), y: u.y + Math.sin(dir) * (R + 4), dx: Math.cos(dir), dy: Math.sin(dir), left: MUTINY.throwRange, by: u.id });
  ev.push({ t: 'throw', id: u.id, weapon: u.weapon });
  u.weapon = 'fists';
  u.ammo = 0;
}

/** Thrown things fly over tables but not bunks or walls, and kill the first one they meet (the general: his gun). */
function flyStep(b: Brawl, dt: number, ev: Ev[]): void {
  for (const f of [...b.flying]) {
    const len = Math.min(f.left, MUTINY.throwSpeed * dt);
    const x2 = f.x + f.dx * len;
    const y2 = f.y + f.dy * len;
    let t = 1;
    let wall = false;
    for (const r of blockers(b, 'shot')) {
      const hit = segRect(f.x, f.y, x2, y2, r);
      if (hit !== null && hit < t) {
        t = hit;
        wall = true;
      }
    }
    const by = find(b, f.by);
    let victim: Unit | null = null;
    for (const v of b.units) {
      if (!by || !canHit(by, v)) continue;
      const hit = segCircle(f.x, f.y, x2, y2, v.x, v.y, R + 4);
      if (hit !== null && hit <= t) {
        t = hit;
        victim = v;
        wall = false;
      }
    }
    f.x += f.dx * len * t;
    f.y += f.dy * len * t;
    f.left -= len * t;
    if (victim) {
      if (victim.side === 'general') disarm(b, victim, ev);
      else kill(b, victim, f.by, f.kind, Math.atan2(f.dy, f.dx), ev);
    }
    if (victim || wall || f.left <= 0.5) {
      // It drops where it stopped, a little short of a wall.
      const x = f.x - f.dx * (wall ? 8 : 0);
      const y = f.y - f.dy * (wall ? 8 : 0);
      b.flying.splice(b.flying.indexOf(f), 1);
      b.items.push({ id: b.nextId++, kind: f.kind, x, y, ammo: f.ammo });
      ev.push({ t: 'land', x, y, weapon: f.kind });
    }
  }
}

/**
 * A shot goes along the line to the first one in it, or to the wall. The general's bullet takes whoever stands
 * in the way, his own men too; the player's passes his allies and the general.
 */
function shoot(b: Brawl, u: Unit, dir: number, ev: Ev[]): void {
  const x2 = u.x + Math.cos(dir) * MUTINY.shotRange;
  const y2 = u.y + Math.sin(dir) * MUTINY.shotRange;
  let t = 1;
  for (const r of blockers(b, 'shot')) {
    const hit = segRect(u.x, u.y, x2, y2, r);
    if (hit !== null && hit < t) t = hit;
  }
  let victim: Unit | null = null;
  for (const v of b.units) {
    if (v === u || !alive(v)) continue;
    if (u.side === 'player' && (v.side === 'ally' || v.side === 'general')) continue;
    const hit = segCircle(u.x, u.y, x2, y2, v.x, v.y, R);
    if (hit !== null && hit < t) {
      t = hit;
      victim = v;
    }
  }
  u.ammo--;
  b.shots++;
  ev.push({ t: 'shot', by: u.id, x1: u.x, y1: u.y, x2: u.x + (x2 - u.x) * t, y2: u.y + (y2 - u.y) * t });
  if (victim) kill(b, victim, u.id, 'nagan', dir, ev);
  // A shot is heard everywhere in the room.
  for (const m of b.units) if (m.side === 'loyal' && m.mode === 'idle' && m.frozen <= 0) alert(b, m, nearestOf(b, m, ours));
}

// ---------- the general's men and the player's allies ----------

function nearestOf(b: Brawl, u: Unit, which: (v: Unit) => boolean): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const v of b.units) {
    if (v === u || !which(v)) continue;
    const d = dist(u, v);
    if (d < bestD) {
      best = v;
      bestD = d;
    }
  }
  return best;
}

function alert(b: Brawl, u: Unit, target: Unit | null): void {
  if (!target) return;
  u.mode = 'alert';
  u.timer = MUTINY.react;
  u.target = target.id;
  u.dir = angleTo(u, target);
}

/** One of the general's men sees a rebel: in front of him, near enough, and nothing tall in between. */
function sees(b: Brawl, u: Unit, v: Unit): boolean {
  const d = dist(u, v);
  if (d > MUTINY.view) return false;
  if (d > 2 * R + 30 && Math.abs(turn(u.dir, angleTo(u, v))) > MUTINY.cone) return false;
  return clear(b, u.x, u.y, v.x, v.y, 'sight');
}

/** Wind-up and recovery, the same for every fighter; true while busy with them. */
function busy(b: Brawl, u: Unit, dt: number, ev: Ev[]): boolean {
  if (u.mode === 'windup') {
    u.timer -= dt;
    // The swing lunges along the line it was aimed: stepping back doesn't save you, stepping aside does.
    if (MUTINY.lunge > 0) move(b, u, Math.cos(u.aim) * MUTINY.lunge, Math.sin(u.aim) * MUTINY.lunge, dt);
    if (u.timer <= 0) {
      swing(b, u, u.aim, ev);
      u.mode = 'recover';
      u.timer = MUTINY.npcCooldown;
    }
    return true;
  }
  if (u.mode === 'recover') {
    u.timer -= dt;
    if (u.timer <= 0) u.mode = 'chase';
    return true;
  }
  return false;
}

/** Goes for the target and raises his arm once in reach (the wind-up is the tell the player reads). */
function fight(b: Brawl, u: Unit, target: Unit, dt: number, ev: Ev[]): void {
  u.target = target.id;
  const d = dist(u, target);
  if (d <= swingFrom(u.weapon) && clear(b, u.x, u.y, target.x, target.y, 'shot')) {
    u.mode = 'windup';
    u.aim = angleTo(u, target);
    u.dir = u.aim;
    u.timer = (MUTINY.npcWindup + (random(b) * 2 - 1) * MUTINY.npcWindupJitter) * (b.slow ? MUTINY.slowWindup : 1);
    ev.push({ t: 'windup', id: u.id });
    return;
  }
  u.mode = 'chase';
  steer(b, u, target.x, target.y, MUTINY.npcSpeed, dt);
}

function loyalStep(b: Brawl, u: Unit, dt: number, ev: Ev[]): void {
  if (busy(b, u, dt, ev)) return;
  if (u.mode === 'idle') {
    for (const v of b.units) {
      if (ours(v) && sees(b, u, v)) {
        alert(b, u, v);
        if (random(b) < 0.5) say(b, u, pick(b, BARKS.loyal), ev, 4);
        // He shouts, and the men who hear him turn too.
        for (const m of b.units)
          if (m !== u && m.side === 'loyal' && m.mode === 'idle' && m.frozen <= 0 && dist(m, u) <= MUTINY.hear && clear(b, m.x, m.y, u.x, u.y, 'sound')) alert(b, m, v);
        return;
      }
    }
    return;
  }
  if (u.mode === 'alert') {
    u.timer -= dt;
    const t = u.target ? find(b, u.target) : undefined;
    if (t) u.dir = angleTo(u, t);
    if (u.timer <= 0) u.mode = 'chase';
    return;
  }
  // Chasing: the player if he is about as near as anyone, else the nearest rebel.
  const near = nearestOf(b, u, ours);
  const p = player(b);
  const target = alive(p) && near && dist(u, p) <= dist(u, near) + 80 ? p : near;
  if (!target) {
    u.mode = 'idle';
    return;
  }
  fight(b, u, target, dt, ev);
}

function allyStep(b: Brawl, u: Unit, dt: number, ev: Ev[]): void {
  if (busy(b, u, dt, ev)) return;
  const s = b.sofa;
  if (s?.held && s.helper === u.id) {
    if (s.attached) return;
    const tx = s.x + s.hx;
    const ty = s.y + s.hy;
    if (hyp(tx - u.x, ty - u.y) < 10) {
      s.attached = true;
      u.x = tx;
      u.y = ty;
      return;
    }
    steer(b, u, tx, ty, MUTINY.npcSpeed, dt);
    return;
  }
  const enemy = nearestOf(b, u, theirs);
  if (enemy && dist(u, enemy) <= MUTINY.engage) {
    fight(b, u, enemy, dt, ev);
    return;
  }
  u.mode = 'follow';
  const p = player(b);
  if (dist(u, p) > MUTINY.followFar) steer(b, u, p.x, p.y, MUTINY.npcSpeed, dt);
  else if (dist(u, p) < MUTINY.followNear) u.path = [];
}

/** «Отставить!»: a waverer leaves the fight for the bunks. */
function waver(b: Brawl, u: Unit, ev: Ev[]): void {
  u.side = 'neutral';
  u.mode = 'waver';
  u.target = null;
  const spots = room(b).sitSpots;
  let best = spots[0]!;
  for (const s of spots) if (hyp(s[0] - u.x, s[1] - u.y) < hyp(best[0] - u.x, best[1] - u.y)) best = s;
  u.hx = best[0];
  u.hy = best[1];
  b.stats.wavered.push(u.face);
  if (b.sofa?.helper === u.id) {
    b.sofa.helper = null;
    b.sofa.attached = false;
  }
  say(b, u, pick(b, BARKS.waver), ev);
}

/** Sitting it out, a waverer watches: once one side leads by enough, he goes over to it. */
function waverStep(b: Brawl, u: Unit, dt: number, ev: Ev[]): void {
  if (!u.waverer) return;
  if (u.mode === 'waver') {
    if (hyp(u.hx - u.x, u.hy - u.y) < 8) {
      u.mode = 'sit';
      u.timer = MUTINY.waverThink;
    } else steer(b, u, u.hx, u.hy, MUTINY.npcSpeed, dt);
    return;
  }
  u.timer -= dt;
  if (u.timer > 0) return;
  u.timer = MUTINY.waverThink;
  const us = b.units.filter(ours).length;
  const them = b.units.filter(theirs).length;
  if (us - them >= MUTINY.waverLead) {
    u.side = 'ally';
    u.mode = 'follow';
    u.waverer = false;
    b.stats.rejoined.push(u.face);
    say(b, u, BARKS.rejoin, ev);
  } else if (them - us >= MUTINY.waverLead) {
    u.side = 'loyal';
    u.mode = 'chase';
    u.waverer = false;
    b.stats.turned.push(u.face);
    say(b, u, BARKS.turn, ev);
  }
}

/** Крыпоткин does not fight: he walks in between the fighters and talks. A blow meant for another can find him. */
function krypotkinStep(b: Brawl, u: Unit, dt: number, ev: Ev[]): void {
  let mid: { x: number; y: number } | null = null;
  let best = Infinity;
  for (const a of b.units) {
    if (!ours(a)) continue;
    for (const c of b.units) {
      if (!theirs(c)) continue;
      const d = dist(a, c);
      if (d < 260 && d < best) {
        best = d;
        mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
      }
    }
  }
  if (mid) {
    if (dist(u, mid) > 46) steer(b, u, mid.x, mid.y, MUTINY.krypotkinSpeed, dt);
    if (dist(u, mid) < 180 && u.bark <= 0) say(b, u, pick(b, BARKS.krypotkin), ev, MUTINY.krypotkinEvery);
  } else {
    const p = player(b);
    if (dist(u, p) > 170) steer(b, u, p.x, p.y, MUTINY.krypotkinSpeed, dt);
  }
}

// ---------- the general ----------

/** The player would stand frozen right by one of the general's men: then he keeps quiet. */
function threatNear(b: Brawl, p: Unit): boolean {
  return b.units.some((u) => theirs(u) && u.frozen <= 0 && dist(u, p) < MUTINY.shoutSafe);
}

export function hears(b: Brawl, x: number, y: number, u: Unit): boolean {
  return hyp(u.x - x, u.y - y) <= MUTINY.shoutRadius && clear(b, x, y, u.x, u.y, 'sound');
}

/**
 * The general does not fight hand to hand: he keeps behind his men, commands and shoots. With his men down he
 * leaves by the far door; in the office, with no men and no cartridge, he backs into the corner.
 */
function generalStep(b: Brawl, g: Unit, dt: number, ev: Ev[]): void {
  const p = player(b);
  const rm = room(b);
  if (g.mode === 'cornered') {
    const c = rm.corner ?? rm.general;
    const there = hyp(c[0] - g.x, c[1] - g.y) <= 12;
    if (!there) steer(b, g, c[0], c[1], MUTINY.generalSpeed, dt);
    g.dir = angleTo(g, p);
    // In his corner, the player close: «Ну? Бей».
    if (there && alive(p) && dist(g, p) < MUTINY.finalNear) {
      b.phase = 'final';
      ev.push({ t: 'final' });
    }
    return;
  }
  const men = b.units.filter(theirs).length;
  const armed = g.weapon === 'nagan' && g.ammo > 0;
  if (!rm.exit && men === 0 && !armed && !b.aim && !b.shout) {
    g.mode = 'cornered';
    ev.push({ t: 'cornered' });
    return;
  }
  if (rm.exit && men === 0 && !b.shout) {
    // Off through the far door, to the next room.
    g.mode = 'flee';
    b.aim = null;
    const tx = rm.exit.x + rm.exit.w + 10;
    const ty = rm.exit.y + rm.exit.h / 2;
    if (g.x > rm.exit.x - 4) {
      g.mode = 'gone';
      ev.push({ t: 'gone' });
      return;
    }
    if (b.exitOpen) steer(b, g, tx, ty, MUTINY.generalSpeed, dt);
    return;
  }
  if (!b.aim) {
    const d = dist(g, p);
    if (d < MUTINY.retreatNear) {
      // Back away: the open direction most away from the player.
      let bestA = angleTo(p, g);
      let bestRoom = -1;
      for (const k of [0, -1, 1, -2, 2, -3, 3]) {
        const a = angleTo(p, g) + k * 0.45;
        const free = reach(b, g.x, g.y, a, 120, 'move');
        if (free > bestRoom + 20) {
          bestRoom = free;
          bestA = a;
        }
      }
      if (bestRoom > R + 4) move(b, g, Math.cos(bestA) * MUTINY.generalSpeed, Math.sin(bestA) * MUTINY.generalSpeed, dt);
    } else if (hyp(g.hx - g.x, g.hy - g.y) > 30 && d > MUTINY.retreatNear + 60) steer(b, g, g.hx, g.hy, MUTINY.generalSpeed * 0.6, dt);
    g.dir = angleTo(g, p);
  }
  if (!alive(p) || b.shout || b.aim) return;
  if (b.shoutCd <= 0) {
    const waverers = b.units.filter((u) => u.waverer && u.side === 'ally' && alive(u) && hears(b, g.x, g.y, u));
    const cancel = waverers.length > 0 && !b.cancelled;
    if (cancel || (hears(b, g.x, g.y, p) && !threatNear(b, p))) {
      b.shout = { kind: cancel ? 'cancel' : 'attention', x: g.x, y: g.y, t: MUTINY.shoutWindup };
      if (cancel) b.cancelled = true;
      ev.push({ t: 'shout', kind: b.shout.kind, x: g.x, y: g.y });
      return;
    }
  }
  if (b.room > 0 && armed && b.shotCd <= 0 && dist(g, p) <= MUTINY.shotRange && clear(b, g.x, g.y, p.x, p.y, 'shot')) {
    b.aim = { x: g.x, y: g.y, dir: angleTo(g, p), t: MUTINY.aim };
    ev.push({ t: 'aim', x: g.x, y: g.y, dir: b.aim.dir });
  }
}

/** «Смир-…» for half a second, then «…но!»: everyone the voice reaches stands frozen; the music drowns it. */
function shoutStep(b: Brawl, dt: number, ev: Ev[]): void {
  const s = b.shout;
  if (!s) return;
  s.t -= dt;
  if (s.t > 0) return;
  b.shout = null;
  b.shoutCd = MUTINY.shoutCooldown;
  if (b.tape) {
    b.stats.drowned++;
    ev.push({ t: 'heard', kind: s.kind, ids: [], drowned: true });
    return;
  }
  const heard = b.units.filter((u) => alive(u) && u.side !== 'general' && u.mode !== 'sit' && hears(b, s.x, s.y, u));
  if (s.kind === 'attention') {
    for (const u of heard) {
      u.frozen = MUTINY.freeze;
      if (u.id === PLAYER) {
        b.stats.frozen++;
        if (u.mode === 'windup') u.mode = 'idle';
        letGo(b, ev);
      } else if (u.mode === 'windup' || u.mode === 'recover') u.mode = 'chase';
    }
  } else for (const u of heard) if (u.waverer && u.side === 'ally') waver(b, u, ev);
  ev.push({ t: 'heard', kind: s.kind, ids: heard.map((u) => u.id), drowned: false });
  if (s.kind === 'attention' && !b.shouted) {
    b.shouted = true;
    const ally = b.units.find((u) => u.side === 'ally' && alive(u));
    if (ally && room(b).tape) {
      ally.bark = 0;
      say(b, ally, BARKS.tape, ev);
    }
  }
}

/** The nagan: the aim line shows, then the shot goes along it. The last cartridge spent, he throws the gun down. */
function aimStep(b: Brawl, dt: number, ev: Ev[]): void {
  const a = b.aim;
  if (!a) return;
  const g = find(b, GENERAL);
  if (!g || !alive(g) || g.weapon !== 'nagan' || g.ammo <= 0) {
    b.aim = null;
    return;
  }
  a.t -= dt;
  g.dir = a.dir;
  if (a.t > 0) return;
  b.aim = null;
  b.shotCd = MUTINY.shotCooldown;
  shoot(b, g, a.dir, ev);
  if (g.ammo <= 0) {
    b.items.push({ id: b.nextId++, kind: 'nagan', x: g.x + 20, y: g.y + 14, ammo: 0 });
    g.weapon = 'fists';
    ev.push({ t: 'empty' });
  }
}

/** Bodies don't overlap: everyone standing is pushed apart, then out of the furniture again. */
function separate(b: Brawl): void {
  const s = b.sofa;
  const pinned = (u: Unit) => u.mode === 'sit' || u.mode === 'cornered' || (s?.held && (u.id === PLAYER || (s.attached && u.id === s.helper)));
  const live = b.units.filter(alive);
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const c = live[j]!;
      const d = dist(a, c);
      if (d >= 2 * R || d === 0) continue;
      const over = 2 * R - d;
      const nx = (c.x - a.x) / d;
      const ny = (c.y - a.y) / d;
      const pa = pinned(a);
      const pc = pinned(c);
      if (pa && pc) continue;
      const ka = pa ? 0 : pc ? 1 : 0.5;
      const kc = 1 - ka;
      a.x -= nx * over * ka;
      a.y -= ny * over * ka;
      c.x += nx * over * kc;
      c.y += ny * over * kc;
    }
  const walls = blockers(b, 'move');
  for (const u of live) if (!pinned(u)) for (const r of walls) pushOut(u, r, R);
}
