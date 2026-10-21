/**
 * How an NPC coordinator thinks: it plans from the last flash (no hidden traps), tries every sequence of
 * commands, plays the creatures' crawl after it and scores the result. Throwaway, like sim.ts.
 */
import { act, clone, creatureAt, creepPhase, manhattan, PLAN_CMDS, striker, visible, DX, DY, type Battle, type Cmd } from './sim.ts';

export interface Plan {
  cmds: Cmd[];
  score: number;
  /** What the coordinator meant to happen, for the debug layer «задумал → сказал → сделал». */
  intent: string;
}

/** The best commands for striker id, seen from the last flash. Ties go to the plan with fewer moves. */
export function plan(b: Battle, id: number, actions = striker(b, id).actions): Plan {
  const seen = visible(b);
  const n = Math.max(0, Math.min(actions, 4));
  let best: Plan = { cmds: [], score: -Infinity, intent: 'стоять' };
  const seq: Cmd[] = [];
  const walk = (depth: number) => {
    if (depth === n) {
      const scored = score(seen, id, seq);
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

function score(seen: Battle, id: number, cmds: readonly Cmd[]): { score: number; intent: string } {
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
        total += 4;
        secrets++;
      } else if (e.t === 'wall' || e.t === 'bump' || e.t === 'blocked') total -= 2;
    }
    if (cmd !== 'stay') total -= 0.15;
  }
  const { attacks } = creepPhase(b);
  const hits = attacks.filter((a) => a.s === id).length;
  total -= hits * 9;
  // After the crawl: a creature right in front is a kill next turn; otherwise get closer, but not too close.
  const ahead = creatureAt(b, s.x + DX[s.dir], s.y + DY[s.dir]);
  if (ahead && !ahead.strong) total += 3;
  let nearest = Infinity;
  for (const c of b.creatures) if (c.alive) nearest = Math.min(nearest, manhattan(c.x, c.y, s.x, s.y));
  if (Number.isFinite(nearest)) total -= 0.6 * Math.max(0, nearest - 2);
  const intent = crushed ? `раздавить ${crushed}` : secrets ? 'подобрать секрет' : hits ? 'не успеть увернуться' : ahead ? 'встретить тварь лицом' : 'подойти ближе';
  return { score: total, intent };
}
