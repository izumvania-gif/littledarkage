/**
 * Throwaway battle rules for the coordinator and striker prototypes (concept §6 «Бой», «Правила в цифрах»).
 * Hard-coded on purpose. A «keep» verdict means rewriting this as apps/game/src/core/battle.ts, never importing it.
 *
 * Grid: x 0..8 left to right, y 0..8 far to near; the coordinators' zone lies past y = 8.
 */

export const SIZE = 9;

/** 0 north (away from the coordinators), 1 east, 2 south (toward them), 3 west. */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export const rot = (d: Dir, by: number): Dir => (((d + by) % 4) + 4) % 4 as Dir;

export type Cmd = 'step' | 'step2' | 'back' | 'left' | 'right' | 'turnL' | 'turnR' | 'about' | 'jump' | 'stay' | 'sniff';

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
};

/** Commands a coordinator plans with (sniffing is the striker's own business). */
export const PLAN_CMDS: readonly Cmd[] = ['step', 'step2', 'back', 'left', 'right', 'turnL', 'turnR', 'about', 'jump', 'stay'];

export const ACTIONS_PER_TURN = 3;
export const MAX_HP = 3;

export interface Striker {
  id: number;
  name: string;
  x: number;
  y: number;
  dir: Dir;
  hp: number;
  alive: boolean;
  /** Cells a jump covers: 2, or 3 for a big rat. */
  jump: number;
  /** Actions lost next turn (snare). */
  lost: number;
  /** Extra actions next turn (secret). */
  bonus: number;
  /** Actions this turn. */
  actions: number;
  sniffed: boolean;
  coord: { name: string; hp: number };
}

export interface Creature {
  id: number;
  x: number;
  y: number;
  strong: boolean;
  alive: boolean;
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

export interface Spawn {
  turn: number;
  x: number;
  y: number;
  strong: boolean;
}

export interface Battle {
  turn: number;
  strikers: Striker[];
  creatures: Creature[];
  traps: Trap[];
  secrets: Secret[];
  spawns: Spawn[];
  /** Creatures retreat after this turn's creature phase. */
  retreatAfter: number;
  nextId: number;
  over: boolean;
}

export type Cell = readonly [number, number];

export type Ev =
  | { t: 'move'; s: number; from: Cell; to: Cell }
  | { t: 'jump'; s: number; from: Cell; to: Cell }
  | { t: 'turn'; s: number; dir: Dir }
  | { t: 'wall'; s: number }
  | { t: 'bump'; s: number; other: number }
  | { t: 'blocked'; s: number; c: number }
  | { t: 'crush'; s: number; c: number; strong: boolean; at: Cell }
  | { t: 'trap'; s: number; kind: TrapKind; at: Cell }
  | { t: 'secret'; s: number; kind: SecretKind; at: Cell }
  | { t: 'stay'; s: number }
  | { t: 'sniff'; s: number }
  | { t: 'lost'; s: number }
  | { t: 'creep'; c: number; from: Cell; to: Cell }
  | { t: 'attack'; c: number; s: number }
  | { t: 'hit'; s: number; coord: boolean; hp: number }
  | { t: 'death'; s: number; coord: boolean }
  | { t: 'spawn'; c: number; at: Cell; strong: boolean }
  | { t: 'retreat' };

export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
export const manhattan = (ax: number, ay: number, bx: number, by: number) => Math.abs(ax - bx) + Math.abs(ay - by);

export function strikerAt(b: Battle, x: number, y: number): Striker | undefined {
  return b.strikers.find((s) => s.alive && s.x === x && s.y === y);
}

export function creatureAt(b: Battle, x: number, y: number): Creature | undefined {
  return b.creatures.find((c) => c.alive && c.x === x && c.y === y);
}

export function striker(b: Battle, id: number): Striker {
  const s = b.strikers.find((it) => it.id === id);
  if (!s) throw new Error(`no striker ${id}`);
  return s;
}

export function clone(b: Battle): Battle {
  return {
    ...b,
    strikers: b.strikers.map((s) => ({ ...s, coord: { ...s.coord } })),
    creatures: b.creatures.map((c) => ({ ...c })),
    traps: b.traps.map((t) => ({ ...t })),
    secrets: b.secrets.map((s) => ({ ...s })),
    spawns: b.spawns.map((s) => ({ ...s })),
  };
}

/** What a coordinator sees in a flash: everything but the traps that have not gone off. */
export function visible(b: Battle): Battle {
  const v = clone(b);
  v.traps = v.traps.filter((t) => t.sprung);
  return v;
}

/** Start of a turn: arrivals, then each striker's action budget (snares and secrets from the last turn). */
export function beginTurn(b: Battle): Ev[] {
  const ev: Ev[] = [];
  b.turn += 1;
  for (const sp of b.spawns.filter((it) => it.turn === b.turn)) {
    if (creatureAt(b, sp.x, sp.y) || strikerAt(b, sp.x, sp.y)) continue;
    const c: Creature = { id: b.nextId++, x: sp.x, y: sp.y, strong: sp.strong, alive: true };
    b.creatures.push(c);
    ev.push({ t: 'spawn', c: c.id, at: [c.x, c.y], strong: c.strong });
  }
  for (const s of b.strikers) {
    s.actions = Math.max(0, ACTIONS_PER_TURN - s.lost + s.bonus);
    s.lost = 0;
    s.bonus = 0;
    s.sniffed = false;
  }
  return ev;
}

/** Moves s into (x, y) by a step or as the landing of a jump; then traps and secrets underfoot. */
function enter(b: Battle, s: Striker, x: number, y: number, landing: boolean, ev: Ev[]): boolean {
  if (!inside(x, y)) {
    ev.push({ t: 'wall', s: s.id });
    return false;
  }
  const other = strikerAt(b, x, y);
  if (other) {
    ev.push({ t: 'bump', s: s.id, other: other.id });
    return false;
  }
  const c = creatureAt(b, x, y);
  if (c) {
    if (c.strong && !landing) {
      ev.push({ t: 'blocked', s: s.id, c: c.id });
      return false;
    }
    c.alive = false;
    ev.push({ t: 'crush', s: s.id, c: c.id, strong: c.strong, at: [x, y] });
  }
  const from: Cell = [s.x, s.y];
  s.x = x;
  s.y = y;
  ev.push({ t: landing ? 'jump' : 'move', s: s.id, from, to: [x, y] });
  underfoot(b, s, ev);
  return true;
}

function underfoot(b: Battle, s: Striker, ev: Ev[]): void {
  const trap = b.traps.find((t) => !t.sprung && t.x === s.x && t.y === s.y);
  if (trap) {
    trap.sprung = true;
    ev.push({ t: 'trap', s: s.id, kind: trap.kind, at: [s.x, s.y] });
    if (trap.kind === 'snare') s.lost += 1;
    else hit(b, s, false, ev);
  }
  const secret = b.secrets.find((it) => !it.taken && it.x === s.x && it.y === s.y);
  if (secret) {
    secret.taken = true;
    ev.push({ t: 'secret', s: s.id, kind: secret.kind, at: [s.x, s.y] });
    if (secret.kind === 'hp') s.hp = Math.min(MAX_HP, s.hp + 1);
    else s.bonus += 1;
  }
}

/** One command of one striker. A striker without actions left (snared, wounded) stands still. */
export function act(b: Battle, id: number, cmd: Cmd): Ev[] {
  const ev: Ev[] = [];
  const s = striker(b, id);
  if (!s.alive) return ev;
  if (s.actions <= 0) {
    ev.push({ t: 'lost', s: s.id });
    return ev;
  }
  s.actions -= 1;
  const go = (dir: Dir) => enter(b, s, s.x + DX[dir], s.y + DY[dir], false, ev);
  switch (cmd) {
    case 'step':
      go(s.dir);
      break;
    case 'step2':
      if (go(s.dir) && s.alive) go(s.dir);
      break;
    case 'back':
      go(rot(s.dir, 2));
      break;
    case 'left':
      go(rot(s.dir, 3));
      break;
    case 'right':
      go(rot(s.dir, 1));
      break;
    case 'turnL':
    case 'turnR':
    case 'about':
      s.dir = rot(s.dir, cmd === 'turnL' ? 3 : cmd === 'turnR' ? 1 : 2);
      ev.push({ t: 'turn', s: s.id, dir: s.dir });
      break;
    case 'jump':
      jump(b, s, ev);
      break;
    case 'stay':
      ev.push({ t: 'stay', s: s.id });
      break;
    case 'sniff':
      s.sniffed = true;
      ev.push({ t: 'sniff', s: s.id });
      break;
  }
  return ev;
}

/** A jump covers up to s.jump cells and lands on the first creature in the way, killing it, strong or weak. The cells it flies over are not touched. */
function jump(b: Battle, s: Striker, ev: Ev[]): void {
  let land = 0;
  for (let k = 1; k <= s.jump; k++) {
    const x = s.x + DX[s.dir] * k;
    const y = s.y + DY[s.dir] * k;
    if (!inside(x, y) || strikerAt(b, x, y)) break;
    land = k;
    if (creatureAt(b, x, y)) break;
  }
  if (land === 0) {
    ev.push({ t: 'wall', s: s.id });
    return;
  }
  enter(b, s, s.x + DX[s.dir] * land, s.y + DY[s.dir] * land, true, ev);
}

/** Every striker's i-th command at once (in id order), as one flash of the lamp. */
export function stepPhase(b: Battle, plans: ReadonlyMap<number, readonly Cmd[]>, i: number): Ev[] {
  const ev: Ev[] = [];
  for (const s of b.strikers) {
    if (!s.alive) continue;
    const cmd = plans.get(s.id)?.[i];
    if (cmd) ev.push(...act(b, s.id, cmd));
    else if (i < ACTIONS_PER_TURN) ev.push(...act(b, s.id, 'stay'));
  }
  return ev;
}

/** The striker a creature crawls to: fewest steps, then nearer the coordinators, then the lower id. */
export function targetOf(b: Battle, c: Creature): Striker | undefined {
  let best: Striker | undefined;
  for (const s of b.strikers) {
    if (!s.alive) continue;
    if (!best) {
      best = s;
      continue;
    }
    const d = manhattan(c.x, c.y, s.x, s.y);
    const bd = manhattan(c.x, c.y, best.x, best.y);
    if (d < bd || (d === bd && (s.y > best.y || (s.y === best.y && s.id < best.id)))) best = s;
  }
  return best;
}

/**
 * Creatures crawl one cell each, straight only, along the longer gap first (the vertical one on a tie).
 * Crawling into a striker is an attack: the creature stays put and the caller decides who takes the hit
 * (the striker, or the coordinator with «Принять удар»).
 */
export function creepPhase(b: Battle): { ev: Ev[]; attacks: { c: number; s: number }[] } {
  const ev: Ev[] = [];
  const attacks: { c: number; s: number }[] = [];
  for (const c of b.creatures) {
    if (!c.alive) continue;
    const target = targetOf(b, c);
    if (!target) break;
    const dx = Math.sign(target.x - c.x);
    const dy = Math.sign(target.y - c.y);
    const vertical: Cell = [c.x, c.y + dy];
    const horizontal: Cell = [c.x + dx, c.y];
    const order = Math.abs(target.y - c.y) >= Math.abs(target.x - c.x) ? [vertical, horizontal] : [horizontal, vertical];
    for (const [x, y] of order) {
      if ((x === c.x && y === c.y) || !inside(x, y) || creatureAt(b, x, y)) continue;
      const s = strikerAt(b, x, y);
      if (s) {
        attacks.push({ c: c.id, s: s.id });
        ev.push({ t: 'attack', c: c.id, s: s.id });
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

/** One hit, to the striker or (accepted for the partner) to the coordinator. */
export function hit(b: Battle, s: Striker, coord: boolean, ev: Ev[] = []): Ev[] {
  if (coord) {
    s.coord.hp -= 1;
    ev.push({ t: 'hit', s: s.id, coord: true, hp: s.coord.hp });
    if (s.coord.hp <= 0) ev.push({ t: 'death', s: s.id, coord: true });
  } else {
    s.hp -= 1;
    ev.push({ t: 'hit', s: s.id, coord: false, hp: s.hp });
    if (s.hp <= 0) {
      s.alive = false;
      ev.push({ t: 'death', s: s.id, coord: false });
    }
  }
  return ev;
}

/** End of a turn: after the last turn the creatures fall back into the dark. */
export function endTurn(b: Battle): Ev[] {
  if (b.turn < b.retreatAfter) return [];
  for (const c of b.creatures) c.alive = false;
  b.over = true;
  return [{ t: 'retreat' }];
}

// ---------- setting up a field ----------

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PairSetup {
  name: string;
  coord: string;
  x: number;
  y?: number;
  jump?: number;
}

export interface FieldSetup {
  seed: number;
  pairs: PairSetup[];
  weak: number;
  traps: number;
  secrets: number;
  /** Late arrivals: [turn, strong] each, placed on the far rows. */
  arrivals?: [number, boolean][];
  retreatAfter?: number;
}

/**
 * A random field: strikers on the near rows facing away from the coordinators, creatures on the far rows,
 * traps and secrets in between. Nothing starts within two steps of a striker.
 */
export function makeBattle(setup: FieldSetup): Battle {
  const r = rng(setup.seed);
  const pick = (n: number) => Math.floor(r() * n);
  const b: Battle = { turn: 0, strikers: [], creatures: [], traps: [], secrets: [], spawns: [], retreatAfter: setup.retreatAfter ?? 8, nextId: 100, over: false };
  setup.pairs.forEach((p, i) => {
    b.strikers.push({ id: i, name: p.name, x: p.x, y: p.y ?? 7, dir: 0, hp: MAX_HP, alive: true, jump: p.jump ?? 2, lost: 0, bonus: 0, actions: ACTIONS_PER_TURN, sniffed: false, coord: { name: p.coord, hp: MAX_HP } });
  });
  const used = new Set<string>(b.strikers.map((s) => `${s.x},${s.y}`));
  const free = (x: number, y: number) => !used.has(`${x},${y}`) && b.strikers.every((s) => manhattan(s.x, s.y, x, y) > 2);
  const place = (rows: [number, number]): Cell => {
    for (let tries = 0; tries < 500; tries++) {
      const x = pick(SIZE);
      const y = rows[0] + pick(rows[1] - rows[0] + 1);
      if (free(x, y)) {
        used.add(`${x},${y}`);
        return [x, y];
      }
    }
    throw new Error('field too crowded');
  };
  for (let i = 0; i < setup.weak; i++) {
    const [x, y] = place([0, 3]);
    b.creatures.push({ id: b.nextId++, x, y, strong: false, alive: true });
  }
  for (let i = 0; i < setup.traps; i++) {
    const [x, y] = place([2, 8]);
    b.traps.push({ x, y, kind: (['pit', 'mine', 'snare'] as const)[i % 3]!, sprung: false });
  }
  for (let i = 0; i < setup.secrets; i++) {
    const [x, y] = place([1, 8]);
    b.secrets.push({ x, y, kind: i % 2 === 0 ? 'action' : 'hp', taken: false });
  }
  for (const [turn, strong] of setup.arrivals ?? []) {
    b.spawns.push({ turn, x: pick(SIZE), y: pick(2), strong });
  }
  return b;
}
