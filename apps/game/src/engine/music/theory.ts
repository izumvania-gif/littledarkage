/**
 * Notes and chords for the music: note names to MIDI, chord symbols to their tones and to an open-position
 * guitar voicing in standard tuning (the yard-guitar chords of the 90s songbook). Pure, no Web Audio.
 */

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** «A4», «C#5», «Bb3» → MIDI (A4 = 69). */
export function midi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const [, letter, acc, oct] = m;
  return 12 * (Number(oct) + 1) + PC[letter!]! + (acc === '#' ? 1 : acc === 'b' ? -1 : 0);
}

export const hz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** Pitch class of a chord root: «F#m» → 6. */
function rootPc(symbol: string): number {
  const m = /^([A-G])([#b]?)/.exec(symbol);
  if (!m) throw new Error(`bad chord ${symbol}`);
  return (PC[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}

const QUALITY: Record<string, readonly number[]> = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10] };

export interface Chord {
  symbol: string;
  root: number;
  /** Pitch classes. */
  tones: number[];
  /** MIDI note per guitar string, low E to high E; -1 is a string not played. */
  voicing: readonly number[];
}

/** Standard tuning, low to high: E2 A2 D3 G3 B3 E4. */
export const STRINGS = [40, 45, 50, 55, 59, 64] as const;

/** Open shapes as frets per string (-1 muted). */
const SHAPES: Record<string, readonly number[]> = {
  Am: [-1, 0, 2, 2, 1, 0],
  A: [-1, 0, 2, 2, 2, 0],
  A7: [-1, 0, 2, 0, 2, 0],
  C: [-1, 3, 2, 0, 1, 0],
  D: [-1, -1, 0, 2, 3, 2],
  Dm: [-1, -1, 0, 2, 3, 1],
  E: [0, 2, 2, 1, 0, 0],
  E7: [0, 2, 0, 1, 0, 0],
  Em: [0, 2, 2, 0, 0, 0],
  F: [1, 3, 3, 2, 1, 1],
  G: [3, 2, 0, 0, 0, 3],
  G7: [3, 2, 0, 0, 0, 1],
  B7: [-1, 2, 1, 2, 0, 2],
};

export const CHORD_NAMES = Object.keys(SHAPES);

export function chord(symbol: string): Chord {
  const shape = SHAPES[symbol];
  if (!shape) throw new Error(`no voicing for ${symbol}`);
  const quality = symbol.replace(/^[A-G][#b]?/, '');
  const intervals = QUALITY[quality];
  if (!intervals) throw new Error(`bad chord quality ${symbol}`);
  const root = rootPc(symbol);
  return {
    symbol,
    root,
    tones: intervals.map((i) => (root + i) % 12),
    voicing: shape.map((f, s) => (f < 0 ? -1 : STRINGS[s]! + f)),
  };
}

/** A key's scale as pitch classes: natural minor or major. «Am» → A B C D E F G. */
export function scale(key: string): number[] {
  const root = rootPc(key);
  const steps = key.endsWith('m') ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  return steps.map((s) => (root + s) % 12);
}

/** The lowest MIDI note of pitch class pc at or above `from`. */
export function atOrAbove(pc: number, from: number): number {
  let m = from;
  while (((m % 12) + 12) % 12 !== pc) m++;
  return m;
}
