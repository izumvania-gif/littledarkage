/**
 * The NPCs of a battle (concept §6 «Напарник и другие пары»).
 * - Coordinators plan from the last flash, never from the true field: hidden traps are unknown to them, so
 *   their mistakes have a reason. They hold their own lane near the zone, let the creatures come and deal
 *   with the ones crawling at their own striker; the others are some other pair's business.
 * - A striker without a voice (his coordinator fell) goes by smell alone.
 * - Strikers carry out what they heard in their own way, and every quirk is switched on by something the
 *   player can see (he flinched, cried «Ай!», was hit). Coordinators' quirks change only the words (voice.ts).
 */
import { act, creatureAt, creepPhase, DX, DY, ORDERS, steps, targetOf, unit, visible, type Battle, type Cmd, type Unit } from './battle.ts';

export interface Plan {
  cmds: Cmd[];
  /** What he meant to happen, for the debug layer «задумал → сказал → сделал». */
  intent: string;
}

export interface PlanOptions {
  /** The pair's lane: a column aside costs a little, more than one a lot. Defaults to the coordinator's column. */
  home?: number;
  /** He keeps to this row or nearer the zone (one row of slack). */
  hold?: number;
  /** Smell range for a striker on his own: he knows only creatures this close, nothing of secrets. */
  blind?: number;
}

/** The row the pairs hold: two rows out from the zone, with one row of slack. */
const HOLD_ROW = 6;

const MOVE_COST: Partial<Record<Cmd, number>> = { step: 0.5, back: 0.5, left: 0.5, right: 0.5, jump: 0.5, step2: 1, turnL: 0.15, turnR: 0.15, about: 0.25 };

/** The best commands for striker id, from what his coordinator saw in the last flash. Ties go to fewer moves. */
export function plan(b: Battle, id: string, opts: PlanOptions = {}): Plan {
  const seen = view(b, id, opts.blind);
  const u = unit(seen, id);
  const n = Math.max(0, Math.min(u.actions, 4));
  const home = opts.home ?? seen.coords.find((c) => c.id === u.coord)?.x ?? u.x;
  const hold = opts.hold ?? HOLD_ROW;
  // His creatures: crawling at him, or close enough to be his problem anyway.
  const mine = new Set(seen.creatures.filter((c) => c.alive && (targetOf(seen, c)?.id === id || steps(c.x, c.y, u.x, u.y) <= 2)).map((c) => c.id));
  let best: Plan & { score: number } = { cmds: [], intent: 'стоять', score: -Infinity };
  const seq: Cmd[] = [];
  const walk = (depth: number) => {
    if (depth === n) {
      const s = score(seen, id, seq, home, hold, mine);
      if (s.score > best.score) best = { cmds: [...seq], intent: s.intent, score: s.score };
      return;
    }
    for (const c of ORDERS) {
      seq.push(c);
      walk(depth + 1);
      seq.pop();
    }
  };
  walk(0);
  return { cmds: best.cmds, intent: best.intent };
}

/** What the planner knows: a flash (no hidden traps) or, alone in the dark, only the creatures he smells. */
function view(b: Battle, id: string, blind?: number): Battle {
  const v = visible(b);
  if (blind === undefined) return v;
  const u = unit(v, id);
  v.creatures = v.creatures.filter((c) => c.alive && Math.hypot(c.x - u.x, c.y - u.y) <= blind + 0.25);
  v.secrets = [];
  v.traps = [];
  return v;
}

/** A cheap copy for trying a plan: only what act() and creepPhase() change. */
function scratch(b: Battle): Battle {
  return {
    ...b,
    units: b.units.map((u) => ({ ...u })),
    creatures: b.creatures.map((c) => ({ ...c })),
    traps: b.traps.map((t) => ({ ...t })),
    secrets: b.secrets.map((s) => ({ ...s })),
  };
}

function score(seen: Battle, id: string, cmds: readonly Cmd[], home: number, hold: number, mine: ReadonlySet<number>): { score: number; intent: string } {
  const b = scratch(seen);
  const u = unit(b, id);
  u.actions = cmds.length;
  let total = 0;
  let crushed = 0;
  let secrets = 0;
  for (const cmd of cmds) {
    for (const e of act(b, id, cmd)) {
      if (e.t === 'crush') {
        total += (e.strong ? 16 : 12) * (mine.has(e.c) ? 1 : 0.2);
        crushed++;
      } else if (e.t === 'secret') {
        total += 3;
        secrets++;
      } else if (e.t === 'wall' || e.t === 'bump' || e.t === 'blocked') total -= 2;
    }
    total -= MOVE_COST[cmd] ?? 0;
  }
  const off = Math.abs(u.x - home);
  total -= off === 0 ? 0 : off === 1 ? 3 : 3 + 14 * (off - 1);
  total -= 4 * Math.max(0, hold - 1 - u.y);
  const { attacks } = creepPhase(b);
  const hits = attacks.filter((a) => a.s === id).length;
  total -= hits * 9;
  const ahead = creatureAt(b, u.x + DX[u.dir], u.y + DY[u.dir]);
  if (ahead && mine.has(ahead.id)) total += ahead.strong ? 2 : 3;
  let nearest = Infinity;
  for (const c of b.creatures) if (c.alive && mine.has(c.id)) nearest = Math.min(nearest, steps(c.x, c.y, u.x, u.y));
  if (Number.isFinite(nearest)) total -= 0.25 * Math.max(0, nearest - 3);
  const intent = crushed ? `раздавить ${crushed}` : secrets ? 'подобрать секрет' : hits ? 'не успеть увернуться' : ahead ? 'встретить тварь лицом' : 'ждать, пока подползут';
  return { score: total, intent };
}

/** A striker's habits in a fight. */
export type Quirk =
  /** Scared (hit last turn), he mixes left and right — less so the more he trusts the voice. */
  | 'swapsWhenScared'
  /** Stops dead when he smells a creature right next to him. */
  | 'timid'
  /** Jumps at anything ahead of him. */
  | 'believer';

export interface Mood {
  /** He was hit or cried out last turn: visible to his coordinator. */
  scared: boolean;
  /** 0..3, from the barracks (concept «Доверие»). */
  trust: number;
}

const SWAP: Partial<Record<Cmd, Cmd>> = { left: 'right', right: 'left', turnL: 'turnR', turnR: 'turnL' };

/**
 * What a striker actually does with the i-th command he heard. A wounded one (one hit left) manages only
 * two commands of three. Called just before that step, since «timid» and «believer» feel the field as it is now.
 */
export function perform(b: Battle, id: string, heard: Cmd, i: number, quirks: readonly Quirk[], mood: Mood): Cmd {
  const u = unit(b, id);
  if (u.hp === 1 && i >= 2) return 'stay';
  let cmd = heard;
  if (quirks.includes('swapsWhenScared') && mood.scared && mood.trust < 2) cmd = SWAP[cmd] ?? cmd;
  if (quirks.includes('believer') && (cmd === 'step' || cmd === 'step2' || cmd === 'stay') && creatureAhead(b, u, u.jump)) return 'jump';
  if (quirks.includes('timid') && isMove(cmd) && b.creatures.some((c) => c.alive && steps(c.x, c.y, u.x, u.y) <= 1)) return 'stay';
  return cmd;
}

function isMove(cmd: Cmd): boolean {
  return cmd === 'step' || cmd === 'step2' || cmd === 'back' || cmd === 'left' || cmd === 'right' || cmd === 'jump';
}

function creatureAhead(b: Battle, u: Unit, range: number): boolean {
  for (let k = 1; k <= range; k++) if (creatureAt(b, u.x + DX[u.dir] * k, u.y + DY[u.dir] * k)) return true;
  return false;
}

/**
 * Whether an NPC coordinator takes the blow for his striker («Принимаю!»): only when the striker is down to
 * his last hit, never with his own last one. With the player as striker, his partner does it once he trusts him.
 */
export function takesBlow(b: Battle, strikerId: string, opts: { forPlayer?: boolean; trust?: number } = {}): boolean {
  const u = unit(b, strikerId);
  const c = u.coord ? b.coords.find((it) => it.id === u.coord) : undefined;
  if (!c?.alive || c.hp <= 1) return false;
  if (opts.forPlayer) return (opts.trust ?? 0) >= 2;
  return u.hp <= 1;
}
