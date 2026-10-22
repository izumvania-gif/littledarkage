/**
 * Battle rules (concept §6 «Бой», «Правила в цифрах»): a pure, deterministic simulation with no DOM.
 * The whole state is plain JSON, the random generator included, so a battle saves after every turn and
 * plays the same way again from that save. The stages (stages/battle/*) only draw it and collect commands.
 *
 * Grid: x 0..8 left to right, y 0..8 far to near; the coordinators' zone lies past y = 8. A field may have
 * obstacles (the bunks of the barracks in the dark): nobody steps, jumps or crawls through them.
 * A turn: beginTurn → stepPhase for each command (all strikers at once) → creepPhase → strike for each
 * attack (the coordinator may take the blow) → endTurn.
 */

export const SIZE = 9;
export const ACTIONS_PER_TURN = 3;
export const MAX_HP = 3;

/** 0 north (away from the coordinators), 1 east, 2 south (toward them), 3 west. */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;
export const rot = (d: Dir, by: number): Dir => ((((d + by) % 4) + 4) % 4) as Dir;

export type Cmd = 'step' | 'step2' | 'back' | 'left' | 'right' | 'turnL' | 'turnR' | 'about' | 'jump' | 'stay' | 'sniff' | 'cover';

/** How the commands read in the queue and the log. */
export const CMD_LABEL: Record<Cmd, string> = {
  step: 'шаг вперёд',
  step2: 'два шага вперёд',
  back: 'шаг назад',
  left: 'шаг влево',
  right: 'шаг вправо',
  turnL: 'налево',
  turnR: 'направо',
  about: 'кругом',
  jump: 'прыжок',
  stay: 'стой',
  sniff: 'нюхай',
  cover: 'накрой',
};

/** What a coordinator can tell a striker (sniffing and the bag are the striker's own business). */
export const ORDERS: readonly Cmd[] = ['step', 'step2', 'back', 'left', 'right', 'turnL', 'turnR', 'about', 'jump', 'stay'];

/**
 * How the simulation may end a soldier.
 * - free: the battle decides (the player's partner, soldiers of other pairs);
 * - spared: a named soldier who lives to his scenes — a blow that would kill him leaves him on one hit;
 * - dies: the script takes him at the end of that turn at the latest (Сырков in battle 1, everyone in battle 3);
 *   with `spared` nothing else takes him before then, so the script's order holds.
 */
export type Fate = 'free' | 'spared' | { dies: number; spared?: boolean };

export interface Unit {
  id: string;
  x: number;
  y: number;
  dir: Dir;
  hp: number;
  alive: boolean;
  /** Cells a jump covers: 2, or 3 for a big rat. */
  jump: number;
  /** Actions lost next turn (a snare). */
  lost: number;
  /** Extra actions next turn (a secret). */
  bonus: number;
  /** Actions left this turn. */
  actions: number;
  sniffed: boolean;
  /** Carries the sack for a live creature (battle 2). */
  bag: boolean;
  /** Who speaks for him; null (or a fallen coordinator) when he is alone on the field. */
  coord: string | null;
  fate: Fate;
}

export interface Coordinator {
  id: string;
  /** Column of the zone he stands at. */
  x: number;
  hp: number;
  alive: boolean;
  /** The script takes him at the end of that turn (battle 3); his striker is left without a voice. */
  dies?: number;
  /** He will walk onto the field alone once the strikers are gone (the player in battle 3): until then the battle isn't over. */
  walksOut?: boolean;
}

export interface Creature {
  id: number;
  x: number;
  y: number;
  strong: boolean;
  alive: boolean;
  /** Taken alive in a sack. */
  caught: boolean;
  /** Who crushed it or took it alive. */
  by?: string;
}

export type TrapKind = 'pit' | 'mine' | 'snare';
export interface Trap {
  x: number;
  y: number;
  kind: TrapKind;
  sprung: boolean;
}

export type SecretKind = 'action' | 'hp';
export interface Secret {
  x: number;
  y: number;
  kind: SecretKind;
  taken: boolean;
}

/** Creatures arriving at the start of a turn: from the far end, from the side walls, or from everywhere. */
export interface Wave {
  turn: number;
  weak: number;
  strong: number;
  from: 'far' | 'sides' | 'all';
  /** Columns of the far end they come from (the whole width by default). */
  cols?: Cell;
}

export type Outcome = 'retreat' | 'fallen' | 'time';

export interface Battle {
  turn: number;
  /** The battle ends after this turn whatever happens. */
  maxTurns: number;
  /** Creatures fall back after this turn; null when they keep coming (battle 3). */
  retreatAfter: number | null;
  /** State of the random generator. */
  rng: number;
  units: Unit[];
  coords: Coordinator[];
  creatures: Creature[];
  traps: Trap[];
  secrets: Secret[];
  waves: Wave[];
  /** Cells nobody can enter (absent in battles saved before there were any). */
  obstacles?: Cell[];
  nextId: number;
  over: boolean;
  outcome: Outcome | null;
}

export type Cell = readonly [number, number];

export type Ev =
  | { t: 'move'; s: string; from: Cell; to: Cell }
  | { t: 'jump'; s: string; from: Cell; to: Cell }
  | { t: 'turn'; s: string; dir: Dir }
  | { t: 'wall'; s: string }
  | { t: 'obstacle'; s: string; at: Cell }
  | { t: 'bump'; s: string; other: string }
  | { t: 'blocked'; s: string; c: number }
  | { t: 'crush'; s: string; c: number; strong: boolean; at: Cell }
  | { t: 'capture'; s: string; c: number; at: Cell }
  | { t: 'miss'; s: string }
  | { t: 'trap'; s: string; kind: TrapKind; at: Cell }
  | { t: 'secret'; s: string; kind: SecretKind; at: Cell }
  | { t: 'stay'; s: string }
  | { t: 'sniff'; s: string }
  | { t: 'lost'; s: string }
  | { t: 'creep'; c: number; from: Cell; to: Cell }
  | { t: 'attack'; c: number; s: string }
  | { t: 'hit'; s: string; hp: number }
  | { t: 'graze'; s: string }
  | { t: 'fall'; s: string; scripted: boolean }
  | { t: 'coordHit'; c: string; hp: number }
  | { t: 'coordDown'; c: string }
  | { t: 'arrive'; c: number; at: Cell; strong: boolean }
  | { t: 'retreat' }
  | { t: 'end'; outcome: Outcome };

// ---------- queries ----------

export const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
export const steps = (ax: number, ay: number, bx: number, by: number): number => Math.abs(ax - bx) + Math.abs(ay - by);

export function unit(b: Battle, id: string): Unit {
  const u = b.units.find((it) => it.id === id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
}

export function coordinator(b: Battle, id: string): Coordinator | undefined {
  return b.coords.find((c) => c.id === id);
}

export function unitAt(b: Battle, x: number, y: number): Unit | undefined {
  return b.units.find((u) => u.alive && u.x === x && u.y === y);
}

export function creatureAt(b: Battle, x: number, y: number): Creature | undefined {
  return b.creatures.find((c) => c.alive && c.x === x && c.y === y);
}

/** The obstacles as a grid, and the ways to each cell around them, kept per obstacle list (they never move). */
const grids = new WeakMap<readonly Cell[], { blocked: Uint8Array; ways: Map<number, readonly number[]> }>();

function grid(b: Battle): { blocked: Uint8Array; ways: Map<number, readonly number[]> } | null {
  const list = b.obstacles;
  if (!list?.length) return null;
  let g = grids.get(list);
  if (!g) {
    const blocked = new Uint8Array(SIZE * SIZE);
    for (const [x, y] of list) if (inside(x, y)) blocked[y * SIZE + x] = 1;
    g = { blocked, ways: new Map() };
    grids.set(list, g);
  }
  return g;
}

export function obstacleAt(b: Battle, x: number, y: number): boolean {
  const g = grid(b);
  return !!g && inside(x, y) && g.blocked[y * SIZE + x] === 1;
}

/**
 * Steps from (x, y) to every cell going around the obstacles (Infinity where there is no way), indexed
 * y * SIZE + x. On an open field it is just the count of steps.
 */
export function distances(b: Battle, x: number, y: number): readonly number[] {
  const g = grid(b);
  const key = y * SIZE + x;
  const known = g?.ways.get(key);
  if (known) return known;
  const d = new Array<number>(SIZE * SIZE).fill(Infinity);
  if (!inside(x, y)) return d;
  d[key] = 0;
  const queue: number[] = [key];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i]!;
    const cx = at % SIZE;
    const cy = (at - cx) / SIZE;
    for (let dir = 0; dir < 4; dir++) {
      const nx = cx + DX[dir]!;
      const ny = cy + DY[dir]!;
      const n = ny * SIZE + nx;
      if (!inside(nx, ny) || d[n]! <= d[at]! + 1 || g?.blocked[n]) continue;
      d[n] = d[at]! + 1;
      queue.push(n);
    }
  }
  g?.ways.set(key, d);
  return d;
}

/** The way from a to b in steps, around the obstacles if there are any. */
function way(b: Battle, ax: number, ay: number, bx: number, by: number): number {
  return b.obstacles?.length ? distances(b, bx, by)[ay * SIZE + ax]! : steps(ax, ay, bx, by);
}

/** A world offset seen from a unit facing dir: how far to its right and ahead. */
export function relative(dir: Dir, dx: number, dy: number): { right: number; ahead: number } {
  // (+ 0 turns -0 into 0.)
  switch (dir) {
    case 0:
      return { right: dx + 0, ahead: -dy + 0 };
    case 1:
      return { right: dy + 0, ahead: dx + 0 };
    case 2:
      return { right: -dx + 0, ahead: dy + 0 };
    case 3:
      return { right: -dy + 0, ahead: -dx + 0 };
  }
}

export function clone(b: Battle): Battle {
  return structuredClone(b);
}

/** What a coordinator sees in a flash: everything but the traps that have not gone off. */
export function visible(b: Battle): Battle {
  const v = clone(b);
  v.traps = v.traps.filter((t) => t.sprung);
  return v;
}

export interface Scent {
  /** Offsets relative to the striker's facing, in cells. */
  right: number;
  ahead: number;
  /** 1 next to him, fading to 0 at the edge of the range. */
  strength: number;
  strong: boolean;
}

/** What a blind striker smells: creatures within range (Euclidean, in cells), relative to where he looks. */
export function smell(b: Battle, id: string, range: number): Scent[] {
  const u = unit(b, id);
  const out: Scent[] = [];
  for (const c of b.creatures) {
    if (!c.alive) continue;
    const d = Math.hypot(c.x - u.x, c.y - u.y);
    if (d > range + 0.25) continue;
    const r = relative(u.dir, c.x - u.x, c.y - u.y);
    out.push({ ...r, strength: Math.max(0.15, 1 - (d - 1) / range), strong: c.strong });
  }
  return out;
}

// ---------- the random generator (mulberry32 on the battle's own state) ----------

export function random(b: Battle): number {
  b.rng = (b.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(b.rng ^ (b.rng >>> 15), 1 | b.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const pick = (b: Battle, n: number): number => Math.floor(random(b) * n);

/**
 * The one random thing in a turn (concept: «Случайна одна перекличка»): when several coordinators shout at
 * once, a striker may hear his neighbour's command instead of his own. More voices and more alike commands
 * make it likelier. `base` is the chance with two voices.
 */
export function mishears(b: Battle, voices: number, alike: boolean, base: number): boolean {
  if (voices < 2) return false;
  return random(b) < base * (voices - 1) * (alike ? 1.5 : 1);
}

// ---------- a turn ----------

/** Start of a turn: arrivals, then each striker's actions (a snare costs one, a secret gives one). */
export function beginTurn(b: Battle): Ev[] {
  const ev: Ev[] = [];
  b.turn += 1;
  for (const w of b.waves) if (w.turn === b.turn) arrive(b, w, ev);
  for (const u of b.units) {
    u.actions = Math.max(0, ACTIONS_PER_TURN - u.lost + u.bonus);
    u.lost = 0;
    u.bonus = 0;
    u.sniffed = false;
  }
  return ev;
}

function arrive(b: Battle, w: Wave, ev: Ev[]): void {
  const edge = (): Cell => {
    const side = w.from === 'far' ? 0 : w.from === 'sides' ? 1 + pick(b, 2) : pick(b, 4);
    if (side === 0) {
      const [lo, hi] = w.cols ?? [0, SIZE - 1];
      return [lo + pick(b, hi - lo + 1), 0];
    }
    if (side === 1) return [0, pick(b, SIZE - 2)];
    if (side === 2) return [SIZE - 1, pick(b, SIZE - 2)];
    return [pick(b, SIZE), SIZE - 1];
  };
  const spawn = (strong: boolean) => {
    for (let tries = 0; tries < 30; tries++) {
      const [x, y] = edge();
      if (creatureAt(b, x, y) || unitAt(b, x, y) || obstacleAt(b, x, y)) continue;
      const c: Creature = { id: b.nextId++, x, y, strong, alive: true, caught: false };
      b.creatures.push(c);
      ev.push({ t: 'arrive', c: c.id, at: [x, y], strong });
      return;
    }
  };
  for (let i = 0; i < w.weak; i++) spawn(false);
  for (let i = 0; i < w.strong; i++) spawn(true);
}

/** Moves u into (x, y) by a step or as the landing of a jump; then traps and secrets underfoot. */
function enter(b: Battle, u: Unit, x: number, y: number, landing: boolean, ev: Ev[]): boolean {
  if (!inside(x, y)) {
    ev.push({ t: 'wall', s: u.id });
    return false;
  }
  if (obstacleAt(b, x, y)) {
    ev.push({ t: 'obstacle', s: u.id, at: [x, y] });
    return false;
  }
  const other = unitAt(b, x, y);
  if (other) {
    ev.push({ t: 'bump', s: u.id, other: other.id });
    return false;
  }
  const c = creatureAt(b, x, y);
  if (c) {
    if (c.strong && !landing) {
      ev.push({ t: 'blocked', s: u.id, c: c.id });
      return false;
    }
    c.alive = false;
    c.by = u.id;
    ev.push({ t: 'crush', s: u.id, c: c.id, strong: c.strong, at: [x, y] });
  }
  const from: Cell = [u.x, u.y];
  u.x = x;
  u.y = y;
  ev.push({ t: landing ? 'jump' : 'move', s: u.id, from, to: [x, y] });
  underfoot(b, u, ev);
  return true;
}

function underfoot(b: Battle, u: Unit, ev: Ev[]): void {
  const trap = b.traps.find((t) => !t.sprung && t.x === u.x && t.y === u.y);
  if (trap) {
    trap.sprung = true;
    ev.push({ t: 'trap', s: u.id, kind: trap.kind, at: [u.x, u.y] });
    if (trap.kind === 'snare') u.lost += 1;
    else hurt(b, u, ev);
  }
  const secret = b.secrets.find((it) => !it.taken && it.x === u.x && it.y === u.y);
  if (secret && u.alive) {
    secret.taken = true;
    ev.push({ t: 'secret', s: u.id, kind: secret.kind, at: [u.x, u.y] });
    if (secret.kind === 'hp') u.hp = Math.min(MAX_HP, u.hp + 1);
    else u.bonus += 1;
  }
}

/** One command of one striker. Without actions left (a snare, a wound) he stands still. */
export function act(b: Battle, id: string, cmd: Cmd): Ev[] {
  const ev: Ev[] = [];
  const u = unit(b, id);
  if (!u.alive) return ev;
  if (u.actions <= 0) {
    ev.push({ t: 'lost', s: u.id });
    return ev;
  }
  u.actions -= 1;
  const go = (dir: Dir) => enter(b, u, u.x + DX[dir], u.y + DY[dir], false, ev);
  switch (cmd) {
    case 'step':
      go(u.dir);
      break;
    case 'step2':
      if (go(u.dir) && u.alive) go(u.dir);
      break;
    case 'back':
      go(rot(u.dir, 2));
      break;
    case 'left':
      go(rot(u.dir, 3));
      break;
    case 'right':
      go(rot(u.dir, 1));
      break;
    case 'turnL':
    case 'turnR':
    case 'about':
      u.dir = rot(u.dir, cmd === 'turnL' ? 3 : cmd === 'turnR' ? 1 : 2);
      ev.push({ t: 'turn', s: u.id, dir: u.dir });
      break;
    case 'jump':
      jump(b, u, ev);
      break;
    case 'stay':
      ev.push({ t: 'stay', s: u.id });
      break;
    case 'sniff':
      u.sniffed = true;
      ev.push({ t: 'sniff', s: u.id });
      break;
    case 'cover':
      cover(b, u, ev);
      break;
  }
  return ev;
}

/**
 * A jump covers up to u.jump cells and lands on the first creature in the way, killing it, strong or weak.
 * Cells flown over are not touched; a wall, a soldier or an obstacle ends it short.
 */
function jump(b: Battle, u: Unit, ev: Ev[]): void {
  let land = 0;
  for (let k = 1; k <= u.jump; k++) {
    const x = u.x + DX[u.dir] * k;
    const y = u.y + DY[u.dir] * k;
    if (!inside(x, y) || unitAt(b, x, y) || obstacleAt(b, x, y)) break;
    land = k;
    if (creatureAt(b, x, y)) break;
  }
  if (land === 0) {
    const x = u.x + DX[u.dir];
    const y = u.y + DY[u.dir];
    if (obstacleAt(b, x, y)) ev.push({ t: 'obstacle', s: u.id, at: [x, y] });
    else ev.push({ t: 'wall', s: u.id });
    return;
  }
  enter(b, u, u.x + DX[u.dir] * land, u.y + DY[u.dir] * land, true, ev);
}

/** The sack: a weak creature right in front is taken alive. A strong one tears it, so the sack stays. */
function cover(b: Battle, u: Unit, ev: Ev[]): void {
  const x = u.x + DX[u.dir];
  const y = u.y + DY[u.dir];
  const c = creatureAt(b, x, y);
  if (!u.bag || !c || c.strong) {
    ev.push({ t: 'miss', s: u.id });
    return;
  }
  u.bag = false;
  c.alive = false;
  c.caught = true;
  c.by = u.id;
  ev.push({ t: 'capture', s: u.id, c: c.id, at: [x, y] });
}

/** Every striker's i-th command at once (in field order), as one flash of the lamp. Missing commands are «стой». */
export function stepPhase(b: Battle, plans: ReadonlyMap<string, readonly Cmd[]>, i: number): Ev[] {
  const ev: Ev[] = [];
  for (const u of b.units) {
    if (!u.alive) continue;
    const cmd = plans.get(u.id)?.[i];
    if (cmd) ev.push(...act(b, u.id, cmd));
    else if (u.actions > 0) ev.push(...act(b, u.id, 'stay'));
  }
  return ev;
}

/** How many command steps this turn takes: the most actions any living striker has. */
export function phases(b: Battle): number {
  return Math.max(0, ...b.units.filter((u) => u.alive).map((u) => u.actions));
}

/** The striker a creature crawls to: fewest steps (around obstacles), then nearer the coordinators, then first in field order. */
export function targetOf(b: Battle, c: Creature): Unit | undefined {
  let best: Unit | undefined;
  let bestD = Infinity;
  for (const u of b.units) {
    if (!u.alive) continue;
    const d = way(b, c.x, c.y, u.x, u.y);
    if (d < bestD || (d === bestD && best && u.y > best.y)) {
      best = u;
      bestD = d;
    }
  }
  return best;
}

export interface Attack {
  c: number;
  s: string;
}

/**
 * Creatures crawl one cell each, straight only, along the longer gap first (the vertical one on a tie); an
 * obstacle in the way is crawled around, by whichever cell brings them nearer.
 * Crawling into a striker is an attack: the creature stays put, and the caller resolves it with strike()
 * (the striker takes the blow, or his coordinator does with «Принять удар»).
 */
export function creepPhase(b: Battle): { ev: Ev[]; attacks: Attack[] } {
  const ev: Ev[] = [];
  const attacks: Attack[] = [];
  const around = !!b.obstacles?.length;
  for (const c of b.creatures) {
    if (!c.alive) continue;
    const target = targetOf(b, c);
    if (!target) break;
    const dx = Math.sign(target.x - c.x);
    const dy = Math.sign(target.y - c.y);
    const vertical: Cell = [c.x, c.y + dy];
    const horizontal: Cell = [c.x + dx, c.y];
    const order = Math.abs(target.y - c.y) >= Math.abs(target.x - c.x) ? [vertical, horizontal] : [horizontal, vertical];
    let nearer = (_x: number, _y: number) => true;
    if (around) {
      const d = distances(b, target.x, target.y);
      const here = d[c.y * SIZE + c.x]!;
      nearer = (x, y) => d[y * SIZE + x]! < here;
      // With the straight cells shut, the sideways ones that still lead to him.
      for (let dir = 0; dir < 4; dir++) {
        const cell: Cell = [c.x + DX[dir]!, c.y + DY[dir]!];
        if (!order.some(([x, y]) => x === cell[0] && y === cell[1])) order.push(cell);
      }
    }
    for (const [x, y] of order) {
      if ((x === c.x && y === c.y) || !inside(x, y) || creatureAt(b, x, y) || obstacleAt(b, x, y) || !nearer(x, y)) continue;
      const u = unitAt(b, x, y);
      if (u) {
        attacks.push({ c: c.id, s: u.id });
        ev.push({ t: 'attack', c: c.id, s: u.id });
      } else {
        ev.push({ t: 'creep', c: c.id, from: [c.x, c.y], to: [x, y] });
        c.x = x;
        c.y = y;
      }
      break;
    }
  }
  return { ev, attacks };
}

/** A creature's blow, taken by the striker or (accepted for him) by his coordinator. */
export function strike(b: Battle, a: Attack, byCoordinator: boolean): Ev[] {
  const ev: Ev[] = [];
  const u = unit(b, a.s);
  const c = u.coord ? coordinator(b, u.coord) : undefined;
  if (byCoordinator && c?.alive) {
    c.hp -= 1;
    ev.push({ t: 'coordHit', c: c.id, hp: c.hp });
    if (c.hp <= 0) {
      c.alive = false;
      ev.push({ t: 'coordDown', c: c.id });
    }
  } else if (u.alive) {
    hurt(b, u, ev);
  }
  return ev;
}

function hurt(b: Battle, u: Unit, ev: Ev[]): void {
  if ((u.fate === 'spared' || (typeof u.fate === 'object' && u.fate.spared)) && u.hp <= 1) {
    ev.push({ t: 'graze', s: u.id });
    return;
  }
  u.hp -= 1;
  ev.push({ t: 'hit', s: u.id, hp: u.hp });
  if (u.hp <= 0) fall(b, u, false, ev);
}

function fall(b: Battle, u: Unit, scripted: boolean, ev: Ev[]): void {
  u.alive = false;
  u.hp = Math.min(u.hp, 0);
  ev.push({ t: 'fall', s: u.id, scripted });
}

/** Takes a soldier off the field now (the script, or a coordinator who walks out of the zone). */
export function remove(b: Battle, id: string): Ev[] {
  const u = unit(b, id);
  if (!u.alive) return [];
  const ev: Ev[] = [];
  fall(b, u, true, ev);
  return ev;
}

/** Puts a soldier on the field (the player walking out alone in battle 3). */
export function enlist(b: Battle, u: Omit<Unit, 'actions' | 'lost' | 'bonus' | 'sniffed'>): Unit {
  const it: Unit = { ...u, actions: 0, lost: 0, bonus: 0, sniffed: false };
  b.units.push(it);
  return it;
}

/** End of a turn: scripted deaths, then the end of the battle if it came (retreat, everyone fallen, time). */
export function endTurn(b: Battle): Ev[] {
  const ev: Ev[] = [];
  for (const u of b.units) {
    if (u.alive && typeof u.fate === 'object' && u.fate.dies <= b.turn) fall(b, u, true, ev);
  }
  for (const c of b.coords) {
    if (c.alive && c.dies !== undefined && c.dies <= b.turn) {
      c.alive = false;
      ev.push({ t: 'coordDown', c: c.id });
    }
  }
  let outcome: Outcome | null = null;
  if (b.retreatAfter !== null && b.turn >= b.retreatAfter) {
    for (const c of b.creatures) c.alive = false;
    ev.push({ t: 'retreat' });
    outcome = 'retreat';
  } else if (b.units.every((u) => !u.alive) && !b.coords.some((c) => c.alive && c.walksOut)) outcome = 'fallen';
  else if (b.turn >= b.maxTurns) outcome = 'time';
  if (outcome) {
    b.over = true;
    b.outcome = outcome;
    ev.push({ t: 'end', outcome });
  }
  return ev;
}

// ---------- setting up a field ----------

export interface PairSetup {
  striker: string;
  /** null: the striker is alone (no voice behind him). */
  coord: string | null;
  x: number;
  y?: number;
  jump?: number;
  hp?: number;
  coordHp?: number;
  fate?: Fate;
  coordDies?: number;
  /** The coordinator walks out alone when the field is empty (battle 3). */
  coordWalksOut?: boolean;
  bag?: boolean;
}

export interface BattleSetup {
  seed: number;
  pairs: readonly PairSetup[];
  weak: number;
  strong?: number;
  traps: number;
  secrets: number;
  waves?: readonly Wave[];
  retreatAfter: number | null;
  maxTurns: number;
  /** Rows the creatures start on (far end by default). */
  creatureRows?: Cell;
  /** Columns they start in (the whole width by default). */
  creatureCols?: Cell;
  /** Cells nobody can enter: the bunks of the barracks. */
  obstacles?: readonly Cell[];
}

/**
 * A field from a setup: strikers on the near rows facing away from the coordinators, creatures on the
 * far rows, traps and secrets in between, nothing within two steps of a striker or on an obstacle.
 * One coordinator may speak for several strikers (the player in battle 3): he stands at his first one.
 */
export function makeBattle(setup: BattleSetup): Battle {
  const b: Battle = {
    turn: 0,
    maxTurns: setup.maxTurns,
    retreatAfter: setup.retreatAfter,
    rng: setup.seed | 0,
    units: [],
    coords: [],
    creatures: [],
    traps: [],
    secrets: [],
    waves: (setup.waves ?? []).map((w) => ({ ...w })),
    ...(setup.obstacles?.length ? { obstacles: setup.obstacles.map(([x, y]): Cell => [x, y]) } : {}),
    nextId: 1,
    over: false,
    outcome: null,
  };
  for (const p of setup.pairs) {
    b.units.push({ id: p.striker, x: p.x, y: p.y ?? 7, dir: 0, hp: p.hp ?? MAX_HP, alive: true, jump: p.jump ?? 2, lost: 0, bonus: 0, actions: ACTIONS_PER_TURN, sniffed: false, bag: p.bag ?? false, coord: p.coord, fate: p.fate ?? 'free' });
    if (p.coord && !b.coords.some((c) => c.id === p.coord)) b.coords.push({ id: p.coord, x: p.x, hp: p.coordHp ?? MAX_HP, alive: true, ...(p.coordDies ? { dies: p.coordDies } : {}), ...(p.coordWalksOut ? { walksOut: true } : {}) });
  }
  const used = new Set([...b.units.map((u) => `${u.x},${u.y}`), ...(b.obstacles ?? []).map(([x, y]) => `${x},${y}`)]);
  const place = ([from, to]: Cell, [left, right]: Cell = [0, SIZE - 1]): Cell => {
    for (let tries = 0; tries < 800; tries++) {
      const x = left + pick(b, right - left + 1);
      const y = from + pick(b, to - from + 1);
      if (!used.has(`${x},${y}`) && b.units.every((u) => steps(u.x, u.y, x, y) > 2)) {
        used.add(`${x},${y}`);
        return [x, y];
      }
    }
    throw new Error('field too crowded');
  };
  const rows = setup.creatureRows ?? [0, 3];
  for (let i = 0; i < setup.weak + (setup.strong ?? 0); i++) {
    const [x, y] = place(rows, setup.creatureCols);
    b.creatures.push({ id: b.nextId++, x, y, strong: i >= setup.weak, alive: true, caught: false });
  }
  for (let i = 0; i < setup.traps; i++) {
    const [x, y] = place([2, 8]);
    b.traps.push({ x, y, kind: (['pit', 'mine', 'snare'] as const)[i % 3]!, sprung: false });
  }
  for (let i = 0; i < setup.secrets; i++) {
    const [x, y] = place([1, 8]);
    b.secrets.push({ x, y, kind: i % 2 === 0 ? 'action' : 'hp', taken: false });
  }
  return b;
}

// ---------- what a battle leaves behind ----------

export interface BattleReport {
  /** Strikers who fell, in field order. */
  fell: string[];
  /** A creature was taken alive in a sack. */
  caught: boolean;
  /** Creatures crushed, by striker. */
  kills: Record<string, number>;
}

/** What the story takes from a finished (or abandoned) battle. */
export function report(b: Battle): BattleReport {
  const kills: Record<string, number> = {};
  for (const c of b.creatures) if (!c.alive && !c.caught && c.by) kills[c.by] = (kills[c.by] ?? 0) + 1;
  return { fell: b.units.filter((u) => !u.alive).map((u) => u.id), caught: b.creatures.some((c) => c.caught), kills };
}
