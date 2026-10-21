/**
 * The band's playing habits as data: strums, fingerpicking, bass lines and drum grids.
 * Grids are written one character per step: x hit, X accent, . rest (16 steps a bar in 4/4, 12 in 6/8).
 */

/** Strum strokes on an eighth-note grid: D down through all strings, U up through the top four, X a muted chop, B the bass string alone, - nothing. */
export type Stroke = 'D' | 'U' | 'X' | 'B' | '-';

export type StrumId = 'boy' | 'boyLight' | 'hit';
export type PickId = 'pick68';

export const STRUMS: Record<StrumId, readonly Stroke[]> = {
  // «Бой»: the yard strum, a down on one, a muted chop on two and four, light ups in between.
  boy: ['D', '-', 'X', 'U', '-', 'U', 'X', 'U'],
  boyLight: ['D', '-', '-', 'U', '-', 'U', 'D', 'U'],
  hit: ['D', '-', '-', '-', '-', '-', '-', '-'],
};

/** Fingerpicking in 6/8, one eighth each: the root's bass string, then the G, B and high E strings and back. */
export const PICKS: Record<PickId, readonly (number | 'B')[]> = {
  pick68: ['B', 3, 4, 5, 4, 3],
};

export type DrumHit = 'kick' | 'snare' | 'hatC' | 'hatO' | 'clap' | 'rim' | 'shaker' | 'crash' | 'sticks';

export type DrumId = 'rock8' | 'rock8Light' | 'disco4' | 'discoBreak' | 'ballad' | 'fill44' | 'fill68';

export const DRUMS: Record<DrumId, Partial<Record<DrumHit, string>>> = {
  rock8: { kick: 'X.......x.x.....', snare: '....X.......X...', hatC: 'X.x.x.x.X.x.x.x.' },
  rock8Light: { kick: 'X.......x.......', snare: '....x.......x...', hatC: 'x.x.x.x.x.x.x.x.' },
  disco4: { kick: 'X...X...X...X...', clap: '....X.......X...', hatC: 'x.x.x.x.x.x.x.x.', hatO: '..x...x...x...x.' },
  discoBreak: { kick: 'X...x...X...x...', hatC: '..x...x...x...x.' },
  ballad: { kick: 'X...........', rim: '......x.....', shaker: 'x.x.x.x.x.x.' },
  // The last bar before a new section: the beat for half a bar, then a snare roll into the next downbeat.
  fill44: { kick: 'X.......X.......', snare: '....X...x.x.xXXX', hatC: 'x.x.x.x.........' },
  fill68: { kick: 'X.....X.....', snare: '......x.x.xX', shaker: 'x.x.x.......' },
};

export type BassId = 'root8' | 'drive' | 'octave8' | 'ballad' | 'hit';
