/**
 * The battles of the game and every number a playtest may change (concept «Правила в цифрах»: these are
 * starting values). The prototypes in prototypes/ answer whether the timers, flashes and haze are right;
 * their verdict lands here, not in the stages.
 */
import type { BattleSetup, Cell, PairSetup, Wave } from '../core/battle.ts';
import { PLAYER_ID, SOLDIERS } from './soldiers.ts';

export const TUNING = {
  /** The coordinator looks at the field (or presses «Готово»). */
  planSeconds: 30,
  /** The coordinator gives three commands. */
  ordersSeconds: 10,
  /** The blind striker acts after hearing his coordinator. */
  strikerSeconds: 10,
  /** The red lamp's rhythm while nothing moves. */
  flashEvery: 2,
  /** One command step (and its flash) during execution. */
  stepSeconds: 0.9,
  /** «Принять удар» stays up this long. */
  acceptSeconds: 2,
  /** The coordinator's line reaches the blind striker this long after the turn starts. */
  listenDelay: 2.3,
  /** How far a striker smells, in cells. */
  smellRange: 2,
  /** Chance a striker hears a neighbour's command instead of his own, with two voices at once. */
  crossTalk: 0.05,
} as const;

export type BattleId = 'training' | 'b1' | 'b2' | 'b3' | 'riot';

/** Which seat the player takes. In battle 3 he walks onto the field alone once his partner falls. */
export type Role = 'coordinator' | 'striker';

export interface BattleDef {
  id: BattleId;
  title: string;
  role: Role;
  /** The player's partner (striker when he coordinates, coordinator when he strikes). */
  partner: string;
  /** The player goes out alone after his partner falls (battle 3). */
  solo?: boolean;
  /** Where it is fought: the tunnel (a lamp over the zone) or the barracks in the dark (no lamp, the bunks). */
  place?: 'tunnel' | 'barracks';
  /** Shown before the first turn when the player starts with no voice behind him (the riot). */
  intro?: { title: string; sub: string };
  /**
   * A small goal the player may help with (concept «Безнадёжный бой без цели»): a striker the player also
   * speaks for, the line that says so on the first turn, and his cry when he crushes one.
   */
  goal?: { striker: string; note: string; cheer: string };
  /** Where in the game, 0..1, for «Красные очки»: in battle the poster tears sooner than in the barracks. */
  t: number;
  setup: Omit<BattleSetup, 'seed'>;
}

/** A pair on the field; a big rat jumps three cells. */
const pair = (striker: string, coord: string | null, x: number, extra: Partial<PairSetup> = {}): PairSetup => ({
  striker,
  coord,
  x,
  ...(SOLDIERS[striker]?.big ? { jump: 3 } : {}),
  ...extra,
});

/** The barracks seen from above for the riot: two-tier bunks along the far wall and by the side walls. */
const BUNKS: readonly Cell[] = [
  [1, 0], [1, 1], [3, 0], [3, 1], [5, 0], [5, 1], [7, 0], [7, 1],
  [0, 3], [0, 4], [8, 3], [8, 4],
];

const waves = (...list: [number, number, number, Wave['from'], Cell?][]): Wave[] => list.map(([turn, weak, strong, from, cols]) => ({ turn, weak, strong, from, ...(cols ? { cols } : {}) }));

export const BATTLES: Readonly<Record<BattleId, BattleDef>> = {
  /** The prologue's workshop: a few training moves with Норкин, three weak creatures, nothing hidden. */
  training: {
    id: 'training',
    t: 0.08,
    title: 'Учебная тревога',
    role: 'coordinator',
    partner: 'norkin',
    setup: {
      pairs: [pair('norkin', PLAYER_ID, 4, { fate: 'spared' })],
      weak: 3,
      traps: 0,
      secrets: 1,
      creatureRows: [2, 3],
      retreatAfter: 4,
      maxTurns: 4,
    },
  },
  /** Cycle 1 «Слух»: the player coordinates. Сырков falls by the script; named soldiers live to their scenes. */
  b1: {
    id: 'b1',
    t: 0.32,
    title: 'Бой 1',
    role: 'coordinator',
    partner: 'norkin',
    setup: {
      pairs: [pair('podvalny', 'korochkina', 1, { fate: 'spared' }), pair('norkin', PLAYER_ID, 4), pair('syrkov', 'cherdakov', 7, { fate: { dies: 5 } })],
      weak: 4,
      traps: 3,
      secrets: 3,
      // The middle of the tunnel is the player's: the other pairs keep their lanes and leave it to him.
      waves: waves([2, 1, 0, 'far', [3, 5]], [4, 1, 0, 'far', [3, 5]], [6, 1, 0, 'far', [3, 5]]),
      creatureRows: [2, 4],
      creatureCols: [3, 5],
      retreatAfter: 8,
      maxTurns: 8,
    },
  },
  /** Cycle 2 «Улики»: the player is blind, Норкин is his voice; the first turn is a training one, no creatures. */
  b2: {
    id: 'b2',
    t: 0.58,
    title: 'Бой 2',
    role: 'striker',
    partner: 'norkin',
    setup: {
      pairs: [pair('podvalny', 'korochkina', 1, { fate: 'spared' }), pair(PLAYER_ID, 'norkin', 4, { bag: true, y: 6 }), pair('pyshkin', 'sedoy', 7, { fate: 'spared' })],
      weak: 0,
      traps: 6,
      secrets: 5,
      waves: waves([2, 4, 0, 'far'], [3, 2, 0, 'sides'], [4, 2, 0, 'far'], [5, 0, 2, 'far'], [6, 2, 0, 'sides'], [7, 0, 1, 'all']),
      retreatAfter: 8,
      maxTurns: 8,
    },
  },
  /**
   * Cycle 3 «Признание»: waves until everyone falls, in the script's order, Крыпоткин first. He has no
   * coordinator: the player speaks for him and for Норкин, three commands a turn between the two, and may
   * help him crush the one creature he wants. Норкин falls by turn 7 at the latest; then the player walks out
   * onto the field alone for the last turns.
   */
  b3: {
    id: 'b3',
    t: 0.82,
    title: 'Бой 3',
    role: 'coordinator',
    partner: 'norkin',
    solo: true,
    goal: {
      striker: 'krypotkin',
      note: 'Крыпоткин без координатора. Он хочет раздавить хоть одну тварь. Говорить ему можешь только ты, а команд на двоих — три.',
      cheer: 'Есть!..',
    },
    setup: {
      pairs: [
        pair('norkin', PLAYER_ID, 5, { fate: { dies: 7 }, coordWalksOut: true }),
        pair('krypotkin', PLAYER_ID, 3, { fate: { dies: 3 } }),
        pair('pyshkin', 'sedoy', 1, { fate: { dies: 6, spared: true }, coordDies: 7 }),
        pair('podvalny', 'korochkina', 7, { fate: { dies: 5, spared: true }, coordDies: 6 }),
      ],
      weak: 3,
      traps: 6,
      secrets: 8,
      waves: waves([2, 3, 0, 'sides'], [3, 0, 2, 'all'], [4, 0, 2, 'all'], [5, 0, 3, 'all'], [6, 0, 3, 'all'], [7, 0, 3, 'all'], [8, 0, 3, 'all'], [9, 0, 3, 'all'], [10, 0, 3, 'all'], [11, 0, 3, 'all']),
      creatureRows: [0, 2],
      retreatAfter: null,
      maxTurns: 12,
    },
  },
  /**
   * After the mutiny: the lights go out and the creatures come into the barracks without an alarm. No lamp, no
   * coordinators: everyone is a striker with no voice behind him, the player too, among the bunks, until
   * everyone has fallen — Крыпоткин first (if he lived through the brawl), the player last. The runner leaves
   * out whoever died in the brawl.
   */
  riot: {
    id: 'riot',
    t: 0.95,
    title: 'Темнота',
    role: 'striker',
    partner: 'norkin',
    place: 'barracks',
    intro: { title: 'Свет погас.', sub: 'Твари в казарме. Ни лампы, ни голоса за спиной: запах, звук и нары на ощупь.' },
    setup: {
      pairs: [
        pair('krypotkin', null, 4, { y: 5, fate: { dies: 2 } }),
        pair('norkin', null, 2, { y: 6, fate: { dies: 4, spared: true } }),
        pair(PLAYER_ID, null, 4, { y: 7, fate: { dies: 6 } }),
        pair('sedoy', null, 6, { y: 6, fate: { dies: 3, spared: true } }),
      ],
      obstacles: BUNKS,
      // Standing still, the player is found in four or five turns; moving well, he lasts to the end.
      weak: 4,
      strong: 3,
      traps: 0,
      secrets: 2,
      waves: waves([2, 1, 3, 'all'], [3, 1, 4, 'all'], [4, 0, 4, 'all'], [5, 0, 5, 'all']),
      creatureRows: [0, 4],
      retreatAfter: null,
      maxTurns: 6,
    },
  },
};
