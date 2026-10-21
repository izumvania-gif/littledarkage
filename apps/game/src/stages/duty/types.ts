/**
 * The contract between a duty (наряд) and the scene runner (concept «Казарма» → «Наряды»): a duty draws its
 * own section of the barracks, lets the general speak through `say` (typed on the caption plate), and hands
 * back how it went.
 */
import type { Settings } from '../../core/settings.ts';
import type { AudioEngine } from '../../engine/audio.ts';
import type { Stage } from '../../render/stage.ts';

export interface DutyContext {
  stage: Stage;
  ui: HTMLElement;
  audio: AudioEngine;
  settings: Settings;
  reduced: boolean;
  /** Where in the game, 0..1, for «Красные очки». */
  t: number;
  /**
   * A line on the caption plate, the general's unless `speaker` (a display name, «Норкин») says otherwise.
   * Resolves when the player has read it, or after `timeoutMs` in timed moments (commands during the work).
   */
  say(text: string, opts?: { speaker?: string; timeoutMs?: number }): Promise<void>;
}

export interface DutyResult {
  /** 0..1: how well it was done, by the general's measure. */
  score: number;
  notes: Record<string, number | boolean>;
}
