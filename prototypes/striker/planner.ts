/**
 * A copy of shared/planner.ts tuned for this prototype: coordinators who hold the line and let the
 * creatures come, instead of marching their blind strikers across the field. With the shared planner
 * the NPC pairs rushed forward and crushed everything before it reached the player, and Норкин's lines
 * were «раз-два вперёд» three times over: a dictation, not a choice.
 */
import { act, clone, creatureAt, creepPhase, manhattan, PLAN_CMDS, striker, visible, DX, DY, type Battle, type Cmd } from '../shared/sim.ts';

export interface Plan {
  cmds: Cmd[];
  score: number;
  intent: string;
}

/** The pairs start one row further up than in the shared setup, so the first creatures are smelled by turn 2. */
export const START_ROW = 6;

const MOVE_COST: Partial<Record<Cmd, number>> = { step: 0.5, back: 0.5, left: 0.5, right: 0.5, jump: 0.5, step2: 1, turnL: 0.15, turnR: 0.15, about: 0.25 };

/** Each pair keeps to its own lane of the tunnel: `home` is its column, a step out of the lane costs a lot. */
export function plan(b: Battle, id: number, home: number, actions = striker(b, id).actions): Plan {
  const seen = visible(b);
  const n = Math.max(0, Math.min(actions, 4));
  let best: Plan = { cmds: [], score: -Infinity, intent: 'стоять' };
  const seq: Cmd[] = [];
  const walk = (depth: number) => {
    if (depth === n) {
      const scored = score(seen, id, home, seq);
      if (scored.score > best.score) best = { cmds: [...seq], ...scored };
      return;
    }
    for (const c of PLAN_CMDS) {
      seq.push(c);
      walk(depth + 1);
      seq.pop();
    }
  };
  walk(0);
  return best;
}

function score(seen: Battle, id: number, home: number, cmds: readonly Cmd[]): { score: number; intent: string } {
  const b = clone(seen);
  const s = striker(b, id);
  s.actions = cmds.length;
  let total = 0;
  let crushed = 0;
  let secrets = 0;
  for (const cmd of cmds) {
    for (const e of act(b, id, cmd)) {
      if (e.t === 'crush') {
        total += e.strong ? 16 : 12;
        crushed++;
      } else if (e.t === 'secret') {
        total += 3;
        secrets++;
      } else if (e.t === 'wall' || e.t === 'bump' || e.t === 'blocked') total -= 2;
    }
    total -= MOVE_COST[cmd] ?? 0;
  }
  total -= 14 * Math.max(0, Math.abs(s.x - home) - 1);
  // …and holds the line near the coordinators instead of marching up the tunnel.
  total -= 4 * Math.max(0, START_ROW - 1 - s.y);
  const { attacks } = creepPhase(b);
  const hits = attacks.filter((a) => a.s === id).length;
  total -= hits * 9;
  const ahead = creatureAt(b, s.x + DX[s.dir], s.y + DY[s.dir]);
  if (ahead) total += ahead.strong ? 2 : 3;
  let nearest = Infinity;
  for (const c of b.creatures) if (c.alive) nearest = Math.min(nearest, manhattan(c.x, c.y, s.x, s.y));
  if (Number.isFinite(nearest)) total -= 0.25 * Math.max(0, nearest - 3);
  const intent = crushed ? `раздавить ${crushed}` : secrets ? 'подобрать секрет' : hits ? 'не успеть увернуться' : ahead ? 'встретить тварь лицом' : 'ждать, пока подползут';
  return { score: total, intent };
}
