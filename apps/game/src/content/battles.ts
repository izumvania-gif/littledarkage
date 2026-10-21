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

export type BattleId = 'training' | 'b1' | 'b2' | 'b3';

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

const waves = (...list: [number, number, number, Wave['from'], Cell?][]): Wave[] => list.map(([turn, weak, strong, from, cols]) => ({ turn, weak, strong, from, ...(cols ? { cols } : {}) }));

export const BATTLES: Readonly<Record<BattleId, BattleDef>> = {
  /** The prologue's workshop: a few training moves with Норкин, three weak creatures, nothing hidden. */
  training: {
    id: 'training',
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
   * Cycle 3 «Признание»: waves until everyone falls, Крыпоткин first. Норкин falls by turn 7 at the latest;
   * then the player walks out onto the field alone for the last turns.
   */
  b3: {
    id: 'b3',
    title: 'Бой 3',
    role: 'coordinator',
    partner: 'norkin',
    solo: true,
    setup: {
      pairs: [
        pair('krypotkin', 'sedoy', 1, { fate: { dies: 2 }, coordDies: 6 }),
        pair('norkin', PLAYER_ID, 4, { fate: { dies: 7 } }),
        pair('podvalny', 'korochkina', 7, { fate: { dies: 5 }, coordDies: 6 }),
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
};
