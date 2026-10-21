/**
 * The order of the game as scenes, each a numbered ROSTA window («3. САМОДЕЯТЕЛЬНОСТЬ»). A save holds the scene
 * the player is in; a scene always plays from its start, so it is saved only between scenes (a battle saves
 * every turn on its own). Milestone 2 covers the prologue and cycle 1; the rest of the game follows.
 */
import type { BattleId } from './battles.ts';

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
  | 'slice_end';

export interface Hotspot {
  id: string;
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
   * - battle: a battle from content/battles.ts;
   * - end: the end of what is built so far.
   */
  kind: 'lineup' | 'workshop' | 'talk' | 'roam' | 'battle' | 'end';
  hotspots?: readonly Hotspot[];
  picks?: number;
  battle?: BattleId;
  /** What follows the knot in the same scene: the duties after the general hands them out. */
  then?: 'duties';
  /** Music for the whole scene (the concert). */
  music?: 'concert';
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
  { id: 'slice_end', num: '', title: '', t: 0.27, kind: 'end' },
];

export function scene(id: SceneId): Scene {
  const s = SCENES.find((it) => it.id === id);
  if (!s) throw new Error(`no scene ${id}`);
  return s;
}

export function nextScene(id: SceneId): SceneId {
  const i = SCENES.findIndex((it) => it.id === id);
  return SCENES[Math.min(SCENES.length - 1, i + 1)]!.id;
}

export function isSceneId(v: unknown): v is SceneId {
  return typeof v === 'string' && SCENES.some((s) => s.id === v);
}
