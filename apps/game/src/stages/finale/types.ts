/**
 * The contract between the finale and the game (concept «Финал и второе прохождение»). The runner says which of
 * the three endings it is and hands over what the run left behind: the replies home, the names, the book of
 * records. The finale hands back the name the player gave at the new roll call, which starts the next playthrough.
 */
import type { Gender } from '../../core/save.ts';
import type { Settings } from '../../core/settings.ts';
import type { AudioEngine } from '../../engine/audio.ts';
import type { Stage } from '../../render/stage.ts';

/** «Шеренга» (the main one), «Новый генерал» (the general killed in the mutiny), «Пустая стена» (spared). */
export type Ending = 'lineup' | 'newGeneral' | 'emptyWall';

/** One line of the book of records: a soldier's name and what the book says about him. */
export interface RegisterEntry {
  name: string;
  /** «пал смертью храбрых», «выбыл», «ходил в разведку»… as the runner words it. */
  note: string;
  crossed: boolean;
}

export interface FinaleContext {
  stage: Stage;
  /** The DOM layer over the canvas (#ui). */
  ui: HTMLElement;
  audio: AudioEngine;
  settings: Settings;
  /** prefers-reduced-motion. */
  reduced: boolean;
  ending: Ending;
  /** The player's replies home this run, in order (letter number and text); read in the dark at the start. */
  replies: { n: number; text: string }[];
  player: { name: string; fem: boolean };
  /** The current name in the dative as the player confirmed it («Кому: …»); the former names are declined by guess. */
  dative?: string;
  /** Recruits' names called out in the lineup: the faces of the fallen under their next names (empty for emptyWall). */
  recruits: string[];
  /** Names the roll call refuses (crossed out in the book across playthroughs). */
  taken: string[];
  /** The book of records: earlier playthroughs' soldiers crossed out, then this run's entries, the player's last. */
  register: RegisterEntry[];
  /** The names the player went by this run (after deaths), for the triangles on the general's desk. */
  formerNames: string[];
}

export interface FinaleResult {
  /**
   * The name (and рядовой/рядовая) given at the new roll call: it starts the next playthrough. Only «Шеренга»
   * asks; null for «Новый генерал» and «Пустая стена».
   */
  newName: { name: string; gender: Gender } | null;
}
