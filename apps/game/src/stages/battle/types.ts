/**
 * The contract between a battle stage and the game. A stage draws the field (Pixi, under «Красные очки»)
 * and the DOM plates, collects the player's commands, plays the turns through core/battle.ts and calls
 * commit() after every endTurn: a battle is saved turn by turn and can't be rewound.
 */
import type { Battle } from '../../core/battle.ts';
import type { BattleMemory } from '../../core/save.ts';
import type { Settings } from '../../core/settings.ts';
import type { BattleDef } from '../../content/battles.ts';
import type { Names } from '../../content/soldiers.ts';
import type { AudioEngine } from '../../engine/audio.ts';
import type { Stage } from '../../render/stage.ts';

export type { BattleMemory } from '../../core/save.ts';

export interface BattleContext {
  stage: Stage;
  /** The DOM layer over the canvas (#ui). */
  ui: HTMLElement;
  audio: AudioEngine;
  settings: Settings;
  /** prefers-reduced-motion. */
  reduced: boolean;
  def: BattleDef;
  battle: Battle;
  memory: BattleMemory;
  /** Saves the battle and its memory; a stage calls it after every endTurn. */
  commit(): void;
  /** ?debug: show the true field and «задумал → сказал → сделал». */
  debug: boolean;
  /**
   * Display names by soldier id for this run (a soldier who fell comes back under a new name); missing ids go
   * by their names in content/soldiers.ts.
   */
  names?: Names;
}

/** Why a stage handed control back. */
export type StageExit = 'over' | 'partnerFell' | 'playerFell';

export interface BattleStage {
  /** Plays turns until the battle is over, the player falls, or (battle 3, coordinator) the partner falls. */
  run(): Promise<StageExit>;
  /** Removes everything it added to the Pixi stage and the DOM, and its listeners. */
  destroy(): void;
}

export function bump(memory: BattleMemory, key: string, by = 1): void {
  memory.stats[key] = (memory.stats[key] ?? 0) + by;
}
