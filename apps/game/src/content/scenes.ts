/**
 * The order of the game as scenes, each a numbered ROSTA window («3. САМОДЕЯТЕЛЬНОСТЬ»). A save holds the scene
 * the player is in; a scene always plays from its start, so it is saved only between scenes (a battle saves
 * every turn on its own). Scenes may depend on what happened (`requires`/`skipIf` a flag), and the faces of the
 * cast stay while their names change: a soldier who fell comes back under a new name (core/service.ts), so
 * hotspot labels name people by face — `{ins:syrkov}` becomes «Пышкиным» once Сырков is gone.
 *
 * Flags the runner sets for the script (the script sets its own with flag_set):
 * - `<face>_fell_c<n>` — fell in the battle of cycle n (and `<face>_fell` for cycle 1, as the first scenes use);
 * - `returned_<face>` — came back as a newcomer at the last muster; `player_returned` likewise for the player;
 * - `caught_creature` — taken alive in battle 2; `krypotkin_killed_one` — Крыпоткин crushed his creature in battle 3;
 * - `general_<face>` — who the general named the new general at the third muster (`general_player` for the player);
 * - `speech_truth` / `speech_hollow` / `speech_order` / `speech_silence` — what the new general (the player) said;
 * - `mutiny` (the script: the player said «не пойдём»), then `mutiny_killed` / `mutiny_spared` / `mutiny_surrendered`
 *   and `mutiny_fought` (killed or spared) from the brawl, `krypotkin_fell_mutiny` if he died in it.
 */
import type { BattleId } from './battles.ts';
import type { TrackName } from '../game/actions.ts';

export type SceneId =
  | 'lineup'
  | 'workshop'
  | 'amateur'
  | 'meeting'
  | 'c1_morning'
  | 'c1_concert'
  | 'c1_duties'
  | 'c1_philosopher'
  | 'c1_mail'
  | 'c1_free'
  | 'c1_alarm'
  | 'c1_battle'
  | 'c1_after'
  | 'c2_muster'
  | 'c2_concert'
  | 'c2_duties'
  | 'c2_free'
  | 'c2_mail'
  | 'c2_krypotkin'
  | 'c2_blindfold'
  | 'c2_battle'
  | 'c2_after'
  | 'c3_muster'
  | 'c3_box'
  | 'c3_concert'
  | 'c3_confession'
  | 'c3_speech'
  | 'c3_mutiny'
  | 'c3_dark'
  | 'c3_riot'
  | 'c3_alarm'
  | 'c3_battle'
  | 'finale';

export interface Hotspot {
  id: string;
  /** May name people by face: `{nom:syrkov}`, `{ins:syrkov}` (instrumental, «с Пышкиным»). */
  label: string;
  /** A spot of the barracks or a character id. */
  at: string;
}

export interface Scene {
  id: SceneId;
  /** The ROSTA caption: number and title. */
  num: string;
  title: string;
  /** Where in the game, 0..1, for «Красные очки». */
  t: number;
  /** A chapter card before the scene («ЧИЛЛ ПЕРВЫЙ. СЛУХ»). */
  chapter?: string;
  /**
   * - lineup, workshop: the opening on the lineup picture (main.ts);
   * - talk: the knot `id` in the barracks;
   * - roam: the knot `id`, then the player walks to `picks` of the hotspots, each the knot `id_<hotspot>`;
   * - muster: the lists «выбыли — прибыли» and the ranks (the new general at the third), a new name for the
   *   player who fell, then the knot `id`;
   * - battle: a battle from content/battles.ts;
   * - mutiny: the brawl with the general (stages/mutiny), then its outcome as flags;
   * - finale: the ending (stages/finale) chosen by the flags; the run ends there.
   */
  kind: 'lineup' | 'workshop' | 'talk' | 'roam' | 'muster' | 'battle' | 'mutiny' | 'finale';
  hotspots?: readonly Hotspot[];
  picks?: number;
  battle?: BattleId;
  /** What follows the knot in the same scene: the duties after the general (or the senior) hands them out. */
  then?: 'duties' | 'duties2';
  /** Music for the whole scene (the concerts). */
  music?: TrackName;
  /** Played only if this flag is set / skipped if it is. */
  requires?: string;
  skipIf?: string;
  /** Who is in the room and where they stand when the scene opens: id → spot, or `spot:pose`. */
  cast?: Readonly<Record<string, string>>;
}

/** Everyone gathered before the general's desk. */
const GATHER = {
  general: 'desk',
  krypotkin: 'bench2',
  norkin: 'line1',
  korochkina: 'line2',
  podvalny: 'line3',
  syrkov: 'line4',
  player: 'line5',
  khvostov: 'line6',
  sedoy: 'line7',
  kroshkin: 'line8',
  cherdakov: 'line9',
  zernov: 'bench6',
} as const;

/** The band on the stage, everyone else on the benches; the sofa's last seat is left for the player. */
const CONCERT = {
  general: 'desk',
  krypotkin: 'poster',
  kroshkin: 'stage1:play',
  cherdakov: 'stage2:play',
  zernov: 'stage3:play',
  podvalny: 'bench1',
  norkin: 'bench2',
  syrkov: 'bench4',
  korochkina: 'bench5',
  sedoy: 'bench6',
  khvostov: 'bunk3',
  player: 'center',
} as const;

/** The evening: everyone on their bunks, the band by the tape recorder. */
const BUNKS = {
  general: 'desk',
  krypotkin: 'poster',
  podvalny: 'bunk1',
  norkin: 'bunk2',
  khvostov: 'bunk3',
  syrkov: 'bunk4',
  korochkina: 'bunk5',
  sedoy: 'bunk6',
  kroshkin: 'stage1',
  cherdakov: 'stage2',
  zernov: 'stage3',
  player: 'center',
} as const;

const { syrkov: _gone, ...AFTER } = BUNKS;

/** From cycle 2 on, everyone is back (the fallen under new names); the runner hides whoever is dead now. */
const SEATS = (who: string, label: string) => ({ id: who, label: `${label} {ins:${who}}`, at: who });

export const SCENES: readonly Scene[] = [
  { id: 'lineup', num: '1.', title: 'ПОСТРОЕНИЕ', t: 0, kind: 'lineup' },
  { id: 'workshop', num: '2.', title: 'ВОРКШОП', t: 0.03, kind: 'workshop' },
  { id: 'amateur', num: '3.', title: 'САМОДЕЯТЕЛЬНОСТЬ', t: 0.05, kind: 'talk', cast: GATHER },
  { id: 'meeting', num: '4.', title: 'ВСТРЕЧА', t: 0.07, kind: 'talk', cast: GATHER },
  { id: 'c1_morning', num: '5.', title: 'РАСПОРЯДОК', t: 0.12, kind: 'talk', chapter: 'ЧИЛЛ ПЕРВЫЙ. СЛУХ', cast: { ...GATHER, krypotkin: 'center' } },
  {
    id: 'c1_concert',
    num: '6.',
    title: 'КОНЦЕРТ',
    t: 0.14,
    kind: 'roam',
    music: 'concert',
    cast: CONCERT,
    picks: 1,
    hotspots: [
      { id: 'norkin', label: 'Сесть с Норкиным', at: 'norkin' },
      { id: 'syrkov', label: 'Сесть с Сырковым', at: 'syrkov' },
      { id: 'korochkina', label: 'Сесть с Корочкиной', at: 'korochkina' },
      { id: 'sedoy', label: 'Сесть с Седым', at: 'sedoy' },
      { id: 'podvalny', label: 'Сесть с Подвальным', at: 'podvalny' },
      { id: 'alone', label: 'Сесть одному', at: 'bench3' },
    ],
  },
  { id: 'c1_duties', num: '7.', title: 'НАРЯДЫ', t: 0.16, kind: 'talk', then: 'duties', cast: GATHER },
  { id: 'c1_philosopher', num: '8.', title: 'ФИЛОСОФ', t: 0.18, kind: 'talk', cast: { ...BUNKS, krypotkin: 'poster', player: 'sofa' } },
  { id: 'c1_mail', num: '9.', title: 'ПОЧТА', t: 0.2, kind: 'talk', cast: { ...GATHER, general: 'mailbox' } },
  {
    id: 'c1_free',
    num: '10.',
    title: 'СВОБОДНОЕ ВРЕМЯ',
    t: 0.22,
    kind: 'roam',
    picks: 2,
    cast: BUNKS,
    hotspots: [
      { id: 'tape', label: 'Включить магнитофон', at: 'tape' },
      { id: 'norkin', label: 'Посидеть с Норкиным', at: 'norkin' },
      { id: 'syrkov', label: 'Посидеть с Сырковым', at: 'syrkov' },
      { id: 'korochkina', label: 'Поговорить с Корочкиной', at: 'korochkina' },
      { id: 'podvalny', label: 'Поговорить с Подвальным', at: 'podvalny' },
      { id: 'sedoy', label: 'Посидеть с Седым', at: 'sedoy' },
      { id: 'krypotkin', label: 'Подойти к Крыпоткину', at: 'krypotkin' },
      { id: 'sickbay', label: 'Сходить в санчасть', at: 'sickbay' },
      { id: 'write', label: 'Написать домой', at: 'desk' },
    ],
  },
  { id: 'c1_alarm', num: '11.', title: 'ТРЕВОГА', t: 0.24, kind: 'talk', cast: GATHER },
  { id: 'c1_battle', num: '12.', title: 'БОЙ', t: 0.32, kind: 'battle', battle: 'b1' },
  { id: 'c1_after', num: '13.', title: 'ОТБОЙ', t: 0.27, kind: 'talk', cast: AFTER },

  // ---------- cycle 2 «Улики» ----------
  { id: 'c2_muster', num: '14.', title: 'ВЫБЫЛИ — ПРИБЫЛИ', t: 0.36, kind: 'muster', chapter: 'ЧИЛЛ ВТОРОЙ. УЛИКИ', cast: GATHER },
  {
    id: 'c2_concert',
    num: '15.',
    title: 'КОНЦЕРТ',
    t: 0.38,
    kind: 'roam',
    music: 'concert2',
    cast: CONCERT,
    picks: 1,
    hotspots: [SEATS('norkin', 'Сесть с'), SEATS('syrkov', 'Сесть с'), SEATS('korochkina', 'Сесть с'), SEATS('sedoy', 'Сесть с'), SEATS('podvalny', 'Сесть с'), { id: 'alone', label: 'Сесть одному', at: 'bench3' }],
  },
  { id: 'c2_duties', num: '16.', title: 'НАРЯДЫ', t: 0.4, kind: 'talk', then: 'duties2', cast: GATHER },
  {
    id: 'c2_free',
    num: '17.',
    title: 'СВОБОДНОЕ ВРЕМЯ',
    t: 0.42,
    kind: 'roam',
    picks: 2,
    cast: BUNKS,
    hotspots: [
      { id: 'recon', label: 'Пойти с Седым в дальний ход', at: 'sedoy' },
      { id: 'tape', label: 'Включить магнитофон', at: 'tape' },
      SEATS('norkin', 'Посидеть с'),
      SEATS('syrkov', 'Посидеть с'),
      SEATS('korochkina', 'Поговорить с'),
      SEATS('podvalny', 'Поговорить с'),
      { id: 'krypotkin', label: 'Подойти к Крыпоткину', at: 'krypotkin' },
      { id: 'sickbay', label: 'Сходить в санчасть', at: 'sickbay' },
    ],
  },
  { id: 'c2_mail', num: '18.', title: 'ПОЧТА', t: 0.44, kind: 'talk', cast: { ...GATHER, general: 'mailbox' } },
  { id: 'c2_krypotkin', num: '19.', title: 'ДОПРОС', t: 0.46, kind: 'talk', cast: { ...GATHER, krypotkin: 'center' } },
  { id: 'c2_blindfold', num: '20.', title: 'ПОВЯЗКА', t: 0.48, kind: 'talk', cast: { ...GATHER, general: 'hatch' } },
  { id: 'c2_battle', num: '21.', title: 'БОЙ', t: 0.58, kind: 'battle', battle: 'b2' },
  { id: 'c2_after', num: '22.', title: 'ОТБОЙ', t: 0.52, kind: 'talk', cast: BUNKS },

  // ---------- cycle 3 «Признание» ----------
  { id: 'c3_muster', num: '23.', title: 'ВЫБЫЛИ — ПРИБЫЛИ', t: 0.6, kind: 'muster', chapter: 'ЧИЛЛ ТРЕТИЙ. ПРИЗНАНИЕ', cast: GATHER },
  { id: 'c3_box', num: '24.', title: 'ТВАРЬ', t: 0.62, kind: 'talk', requires: 'caught_creature', cast: { ...BUNKS, krypotkin: 'center' } },
  {
    id: 'c3_concert',
    num: '25.',
    title: 'КОНЦЕРТ',
    t: 0.64,
    kind: 'roam',
    music: 'concert3',
    cast: CONCERT,
    picks: 1,
    hotspots: [SEATS('norkin', 'Сесть с'), SEATS('syrkov', 'Сесть с'), SEATS('korochkina', 'Сесть с'), SEATS('sedoy', 'Сесть с'), SEATS('podvalny', 'Сесть с'), { id: 'alone', label: 'Сесть одному', at: 'bench3' }],
  },
  { id: 'c3_confession', num: '26.', title: 'ПРИЗНАНИЕ', t: 0.68, kind: 'talk', cast: { ...GATHER, krypotkin: 'center' } },
  { id: 'c3_speech', num: '27.', title: 'РЕЧЬ', t: 0.72, kind: 'talk', cast: GATHER },
  { id: 'c3_mutiny', num: '28.', title: 'БУНТ', t: 0.2, kind: 'mutiny', requires: 'mutiny' },
  { id: 'c3_dark', num: '29.', title: 'ТЕМНОТА', t: 0.95, kind: 'talk', requires: 'mutiny_fought', cast: BUNKS },
  { id: 'c3_riot', num: '30.', title: 'БОЙ', t: 0.95, kind: 'battle', battle: 'riot', requires: 'mutiny_fought' },
  { id: 'c3_alarm', num: '29.', title: 'ТРЕВОГА', t: 0.76, kind: 'talk', skipIf: 'mutiny_fought', cast: GATHER },
  { id: 'c3_battle', num: '30.', title: 'БОЙ', t: 0.82, kind: 'battle', battle: 'b3', skipIf: 'mutiny_fought' },
  { id: 'finale', num: '', title: '', t: 1, kind: 'finale' },
];

/** Whether a scene plays, given the run's flags. */
export function plays(sc: Scene, flags: readonly string[]): boolean {
  if (sc.requires && !flags.includes(sc.requires)) return false;
  if (sc.skipIf && flags.includes(sc.skipIf)) return false;
  return true;
}

export function scene(id: SceneId): Scene {
  const s = SCENES.find((it) => it.id === id);
  if (!s) throw new Error(`no scene ${id}`);
  return s;
}

/** The next scene that plays after this one, given the flags (the finale is always last). */
export function nextScene(id: SceneId, flags: readonly string[] = []): SceneId {
  const i = SCENES.findIndex((it) => it.id === id);
  for (let j = i + 1; j < SCENES.length; j++) if (plays(SCENES[j]!, flags)) return SCENES[j]!.id;
  return 'finale';
}

export function isSceneId(v: unknown): v is SceneId {
  return typeof v === 'string' && SCENES.some((s) => s.id === v);
}
