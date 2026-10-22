/**
 * Service (concept «Цикл и казарма»): who serves under which name and rank. Faces stay and names change: a soldier
 * who fell in cycle 1 or 2 comes back at the next muster as a newcomer with the same face and a new name; in
 * cycle 3 death is final. Ranks go by выслуга, to those who have simply stayed alive longest, and the general draws
 * them by lot among those, as on the role-play («в армии смотрят не на человека, а на выслугу»). Седой refuses his.
 * After battle 2 the general names the new general the same way.
 *
 * Draws use the run's seed and the cycle, so a muster replayed from its start announces the same names.
 */
import { seededRng } from './rng.ts';

export const RANKS = ['рядовой', 'ефрейтор', 'младший сержант', 'сержант'] as const;
export const MAX_RANK = RANKS.length - 1;

/** The player's entry in the roster. */
export const PLAYER_FACE = 'player';

/** The soldiers of the barracks by face, and the names each face goes by, one after another (the last at the finale's wall). */
export const FACE_NAMES: Readonly<Record<string, readonly string[]>> = {
  norkin: ['Норкин', 'Норушкин', 'Норов', 'Норенко'],
  syrkov: ['Сырков', 'Пышкин', 'Творожков', 'Сметанин'],
  korochkina: ['Корочкина', 'Корюшкина', 'Коркина', 'Корнеева'],
  podvalny: ['Подвальный', 'Погребов', 'Чуланов', 'Подклетов'],
  sedoy: ['Седой', 'Сивый', 'Белов', 'Пепельный'],
  khvostov: ['Хвостов', 'Хвостиков', 'Хвостенко', 'Хвостовский'],
  kroshkin: ['Крошкин', 'Крохин', 'Крошечкин', 'Крохмаль'],
  cherdakov: ['Чердаков', 'Чулков', 'Чердынцев', 'Черепков'],
  zernov: ['Зернов', 'Зёрнышкин', 'Зерницын', 'Овсов'],
};
export const FACES = Object.keys(FACE_NAMES);
const FEM_FACES = new Set(['korochkina']);

/** Soldiers of a battle who are a later name of a face (battle 2 has Пышкин, who has Сырков's face). */
const SOLDIER_FACE: Readonly<Record<string, string>> = { pyshkin: 'syrkov' };
export const faceOf = (soldier: string): string => SOLDIER_FACE[soldier] ?? soldier;

export interface Serviceman {
  name: string;
  /** Index into RANKS. */
  rank: number;
  /** The cycle this person arrived in: 1 from the lineup, 2 or 3 as a newcomer. */
  since: number;
  /** Which of the face's names this is (0 the first). */
  life: number;
}

export type Roster = Record<string, Serviceman>;

export function newRoster(playerName: string): Roster {
  const roster: Roster = { [PLAYER_FACE]: { name: playerName, rank: 0, since: 1, life: 0 } };
  for (const face of FACES) roster[face] = { name: FACE_NAMES[face]![0]!, rank: 0, since: 1, life: 0 };
  return roster;
}

export const isFem = (face: string, playerFem = false): boolean => (face === PLAYER_FACE ? playerFem : FEM_FACES.has(face));

/** «рядовой», «ефрейтор»…; рядовая for a woman (the other ranks don't change). */
export function rankWord(rank: number, fem: boolean): string {
  return rank === 0 && fem ? 'рядовая' : RANKS[Math.max(0, Math.min(MAX_RANK, rank))]!;
}

export interface MusterEvent {
  face: string;
  /** The name that left (fell) and the one who arrived with the same face. */
  left?: string;
  arrived?: string;
  /** A new rank, announced. */
  rank?: number;
  /** Offered a rank and said no (Седой). */
  refused?: boolean;
}

export interface Muster {
  /** In the order the general reads them: those who left and arrived, then the ranks. */
  events: MusterEvent[];
  /** Named the new general (the third muster only): a face or PLAYER_FACE. */
  general: string | null;
}

/**
 * The muster before a cycle's chill: the fallen of the last battle come back with new names (the player's is
 * given by the caller, who asks for it), the ranks are drawn, and at the third muster the new general.
 * Returns what to announce; changes the roster in place.
 */
export function muster(roster: Roster, cycle: number, fallen: readonly string[], seed: number, playerName?: string): Muster {
  const rnd = seededRng(seed * 31 + cycle * 7919);
  const events: MusterEvent[] = [];
  for (const face of fallen) {
    const was = roster[face];
    if (!was) continue;
    const life = was.life + 1;
    const name = face === PLAYER_FACE ? (playerName ?? was.name) : (FACE_NAMES[face]?.[life] ?? was.name);
    roster[face] = { name, rank: 0, since: cycle, life };
    events.push({ face, left: was.name, arrived: name });
  }
  // Those who served before go up a step; then new ефрейторы, drawn among the longest-serving privates.
  if (cycle >= 3) {
    for (const [face, s] of Object.entries(roster)) {
      if (s.rank > 0 && s.rank < MAX_RANK && s.since < cycle) {
        s.rank += 1;
        events.push({ face, rank: s.rank });
      }
    }
  }
  const pool = Object.entries(roster)
    .filter(([, s]) => s.rank === 0 && s.since < cycle)
    .map(([face]) => face);
  const eldest = Math.min(...pool.map((f) => roster[f]!.since));
  // Корочкина is the first to get one, simply because she has stayed alive longest (concept «Персонажи»).
  const candidates = shuffle(pool.filter((f) => roster[f]!.since === eldest), rnd).sort((a, b) => Number(b === 'korochkina') - Number(a === 'korochkina'));
  let given = 0;
  for (const face of candidates) {
    if (given >= 2) break;
    if (face === 'sedoy') {
      events.push({ face, refused: true });
      continue;
    }
    roster[face]!.rank = 1;
    events.push({ face, rank: 1 });
    given++;
  }
  return { events, general: cycle === 3 ? drawGeneral(roster, rnd) : null };
}

/** Among the longest-serving (Седой refuses again); the player, if among them, has a third of the chance. */
function drawGeneral(roster: Roster, rnd: () => number): string | null {
  const alive = Object.entries(roster).filter(([face]) => face !== 'sedoy');
  if (!alive.length) return null;
  const eldest = Math.min(...alive.map(([, s]) => s.since));
  const pool = alive.filter(([, s]) => s.since === eldest).map(([face]) => face);
  if (pool.includes(PLAYER_FACE) && (pool.length === 1 || rnd() < 1 / 3)) return PLAYER_FACE;
  const npcs = pool.filter((f) => f !== PLAYER_FACE);
  return npcs[Math.floor(rnd() * npcs.length)] ?? null;
}

/** Who gives the orders among the soldiers present: the highest rank, then the longest service, not the player. */
export function senior(roster: Roster, present: readonly string[]): string | null {
  let best: string | null = null;
  for (const face of present) {
    const s = roster[face];
    if (!s || face === PLAYER_FACE || s.rank === 0) continue;
    const b = best ? roster[best]! : null;
    if (!b || s.rank > b.rank || (s.rank === b.rank && s.since < b.since)) best = face;
  }
  return best;
}

function shuffle<T>(list: T[], rnd: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

/** «с кем?» for a name: Пышкин → Пышкиным, Корочкина → Корочкиной, Седой → Седым, Вася Пупкин → Васей Пупкиным. */
export function instrumental(name: string, fem: boolean): string {
  return name
    .split(' ')
    .map((w) => instrumentalWord(w, fem))
    .join(' ');
}

function instrumentalWord(w: string, fem: boolean): string {
  const lower = w.toLocaleLowerCase('ru');
  const swap = (cut: number, end: string) => w.slice(0, w.length - cut) + end;
  if (fem) {
    if (/(ова|ева|ёва|ина|ына)$/.test(lower)) return swap(1, 'ой');
    if (/ая$/.test(lower)) return swap(2, 'ой');
    if (/[жшчщц]а$/.test(lower)) return swap(1, 'ей');
    if (/а$/.test(lower)) return swap(1, 'ой');
    if (/я$/.test(lower)) return swap(1, 'ей');
    return w;
  }
  if (/(ый|ой)$/.test(lower)) return swap(2, 'ым');
  if (/[кгх]ий$/.test(lower)) return swap(2, 'им');
  if (/ий$/.test(lower)) return swap(2, 'им');
  if (/(ов|ев|ёв|ин|ын)$/.test(lower)) return w + 'ым';
  if (/(их|ых)$/.test(lower) || /[оиуеэюы]$/.test(lower)) return w;
  if (/[жшчщц]а$/.test(lower)) return swap(1, 'ей');
  if (/а$/.test(lower)) return swap(1, 'ой');
  if (/я$/.test(lower)) return swap(1, 'ей');
  if (/[ьй]$/.test(lower)) return swap(1, 'ем');
  if (/[жшчщц]$/.test(lower)) return w + 'ем';
  return w + 'ом';
}
