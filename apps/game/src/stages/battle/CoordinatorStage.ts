/** Placeholder: being written. */
import type { BattleContext, BattleStage, StageExit } from './types.ts';

export class CoordinatorStage implements BattleStage {
  private readonly ctx: BattleContext;

  constructor(ctx: BattleContext, _opts: { solo?: boolean } = {}) {
    this.ctx = ctx;
  }

  async run(): Promise<StageExit> {
    return this.ctx.battle.over ? 'over' : 'over';
  }

  destroy(): void {}
}
