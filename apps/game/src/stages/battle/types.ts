/**
 * The contract between a battle stage and the game. A stage draws the field (Pixi, under «Красные очки»)
 * and the DOM plates, collects the player's commands, plays the turns through core/battle.ts and calls
 * commit() after every endTurn: a battle is saved turn by turn and can't be rewound.
 */
import type { Battle } from '../../core/battle.ts';
import type { Settings } from '../../core/settings.ts';
import type { BattleDef } from '../../content/battles.ts';
import type { AudioEngine } from '../../engine/audio.ts';
import type { Stage } from '../../render/stage.ts';

/** What a battle carries besides the field; saved with it. */
export interface BattleMemory {
  /** The partner's trust in the player, 0..3 (from the barracks; the battle moves it). */
  trust: number;
  /** The partner was hit or cried out last turn, so his quirks are on (visible to the player). */
  partnerScared: boolean;
  /** The player (as striker) was hit last turn: their coordinator is scared too. */
  playerScared: boolean;
  /** Counters for the register and the stats: crushed, secrets, caught, accepted, followed, ignored… */
  stats: Record<string, number>;
}

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
