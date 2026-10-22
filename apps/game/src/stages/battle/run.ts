/**
 * Runs one battle: the player's seat from the battle's definition, and in battle 3 the walk onto the field
 * alone once the partner falls (concept «Структура»: «потом он выходит на поле один»). A striker with no
 * coordinator from the start (the riot after the mutiny) plays alone in the dark too. A battle resumed from
 * a save picks up the same way: if the player is already on the field, it goes on in the dark.
 */
import { creatureAt, enlist, unitAt, type Battle } from '../../core/battle.ts';
import { PLAYER_ID } from '../../content/soldiers.ts';
import { CoordinatorStage } from './CoordinatorStage.ts';
import { StrikerStage } from './StrikerStage.ts';
import type { BattleContext, BattleStage, StageExit } from './types.ts';

export async function runBattle(ctx: BattleContext): Promise<StageExit> {
  const leave = (e: BeforeUnloadEvent) => e.preventDefault();
  window.addEventListener('beforeunload', leave);
  try {
    const b = ctx.battle;
    const me = b.units.find((u) => u.id === PLAYER_ID);
    const alone = ctx.def.role === 'coordinator' && !!me;
    if (ctx.def.role === 'striker' || alone) {
      const voiceless = alone || !me?.coord;
      return await play(new StrikerStage(ctx, voiceless ? { solo: true, ...(!alone && ctx.def.intro ? { intro: ctx.def.intro } : {}) } : {}));
    }
    const exit = await play(new CoordinatorStage(ctx));
    if (exit !== 'partnerFell' || !ctx.def.solo || b.over) return exit;
    walkOut(b);
    ctx.commit();
    return await play(new StrikerStage(ctx, { solo: true }));
  } finally {
    window.removeEventListener('beforeunload', leave);
  }
}

async function play(stage: BattleStage): Promise<StageExit> {
  try {
    return await stage.run();
  } finally {
    stage.destroy();
  }
}

/**
 * The player climbs out of the zone at its middle with the hits left, and the script waits at the end. Anyone
 * else he spoke for (Крыпоткин) is left without a voice.
 */
function walkOut(b: Battle): void {
  const me = b.coords.find((c) => c.id === PLAYER_ID);
  if (me) me.walksOut = false;
  for (const u of b.units) if (u.coord === PLAYER_ID) u.coord = null;
  const x = [4, 3, 5, 2, 6, 1, 7, 0, 8].find((col) => !unitAt(b, col, 8) && !creatureAt(b, col, 8)) ?? 4;
  enlist(b, { id: PLAYER_ID, x, y: 8, dir: 0, hp: Math.max(1, me?.hp ?? 1), alive: true, jump: 2, bag: false, coord: null, fate: { dies: b.maxTurns } });
}
