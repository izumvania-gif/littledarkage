/**
 * The contract between the mutiny brawl and the scene runner (concept «Бунт: драка с генералом»): the runner
 * says who stands where (by trust), lends the caption plate and the tape recorder's music, and gets back how
 * it ended — the general killed or spared, or the player back in line — and what the brawl told of itself.
 */
import type { Settings } from '../../core/settings.ts';
import type { AudioEngine } from '../../engine/audio.ts';
import type { Stage } from '../../render/stage.ts';

export interface MutinyContext {
  stage: Stage;
  ui: HTMLElement;
  audio: AudioEngine;
  settings: Settings;
  reduced: boolean;
  /** Faces: who follows the player (trust ≥ 2), who wavers (1) and may switch sides, who stands with the general. */
  allies: string[];
  waverers: string[];
  loyal: string[];
  /** Крыпоткин is in the barracks and wanders through the fight; he can be hit. */
  krypotkin: boolean;
  /** Display names by face (who(face)); 'general' too. */
  names: Record<string, string>;
  player: { name: string; fem: boolean };
  /** A line on the caption plate: the general's (typed) unless `speaker` (display name) says otherwise. */
  say(text: string, opts?: { speaker?: string; timeoutMs?: number }): Promise<void>;
  /** The tape recorder: start/stop the band's loud «riot» track (the runner wires music; no-op in the dev page). */
  tape(on: boolean): void;
}

export interface MutinyResult {
  outcome: 'killed' | 'spared' | 'surrendered';
  /** Who struck Крыпоткин down, if he fell in the brawl. */
  krypotkinKilledBy: 'player' | 'ally' | 'loyal' | 'general' | null;
  /** How many times the player fell (each fall restarted the room). */
  deaths: number;
  tapeUsed: boolean;
  /** «Летопись бунта»: the ROSTA frame captions shown at the end, in order (the runner may keep them). */
  chronicle: string[];
  seconds: number;
}
