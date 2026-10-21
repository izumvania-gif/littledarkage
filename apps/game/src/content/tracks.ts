/**
 * The cassette of this milestone (concept «Музыка»): the band's cheerful number for the first concert, the cheap
 * disco at Krypotkin's welcome, and a tired ballad on the tape recorder. Own tunes in the spirit of the 90s army
 * songbook, quoting nothing. Phrases are written note:beats, beats of the meter's unit (quarters in 4/4,
 * eighths in 6/8); engine/music turns them into sound and varies a phrase each time it comes back.
 */
import type { TrackDef, TrackId } from '../engine/music/score.ts';

export type { TrackId };

const VERSE_C = ['Am', 'F', 'C', 'G', 'Am', 'F', 'E', 'Am'];
const CHORUS_C = ['F', 'G', 'C', 'Am', 'F', 'G', 'E', 'Am'];

/** «Бодрый номер»: yard strum, a little overdrive, harmonica on top, A minor at 104. */
const concert: TrackDef = {
  id: 'concert',
  title: 'Номер группы',
  bpm: 104,
  meter: [4, 4],
  key: 'Am',
  seed: 1990,
  tuning: true,
  countIn: true,
  lead: 0.3,
  tail: 3,
  tape: 0.25,
  room: 0.5,
  phrases: {
    riffA: 'A3:.5 C4:.5 D4:.5 E4:.5 G4:1 E4:.5 D4:.5 | E4:1.5 D4:.5 C4:.5 A3:.5 A3:1',
    riffB: 'F4:.5 E4:.5 C4:.5 A3:.5 G3:.5 B3:.5 D4:1 | A3:2 r:2',
    v1: 'E5:1 D5:.5 C5:.5 B4:.5 C5:.5 A4:1 | C5:1.5 A4:.5 F4:1 r:1',
    v2: 'E5:1 G5:.5 E5:.5 D5:1 C5:1 | B4:1.5 D5:.5 G4:1 r:1',
    v4: 'B4:1 G#4:.5 B4:.5 D5:1 B4:1 | A4:3 r:1',
    c1: 'A5:1.5 G5:.5 F5:1 C5:1 | D5:1.5 E5:.5 D5:1 B4:1',
    c2: 'E5:1 G5:1 C6:1.5 B5:.5 | A5:3 r:1',
    c4: 'G#5:1.5 F5:.5 E5:1 D5:1 | C5:.5 B4:.5 A4:3',
    solo1: 'D4:.5 F4:.5 A4:1 G4:.5 F4:.5 D4:1 | E4:.5 A4:.5 C5:1.5 B4:.5 A4:1',
    solo2: 'G#4:1 B4:1 D5:1 E5:1 | E5:3 r:1',
  },
  sections: [
    { name: 'вступление', chords: ['Am', 'Am', 'F G', 'Am'], acoustic: 'boy', bass: 'root8', drums: 'rock8', crash: true, level: 0.9, lines: [{ part: 'electric', phrases: ['riffA', 'riffB'] }] },
    { name: 'куплет 1', chords: VERSE_C, acoustic: 'boy', bass: 'drive', drums: 'rock8Light', fill: true, level: 0.85, lines: [{ part: 'harmonica', phrases: ['v1', 'v2', 'v1', 'v4'] }] },
    { name: 'припев 1', chords: CHORUS_C, acoustic: 'boy', power: true, bass: 'root8', drums: 'rock8', crash: true, fill: true, lines: [{ part: 'harmonica', phrases: ['c1', 'c2', 'c1', 'c4'] }] },
    { name: 'куплет 2', chords: VERSE_C, acoustic: 'boy', bass: 'drive', drums: 'rock8Light', fill: true, level: 0.85, lines: [{ part: 'harmonica', phrases: ['v1', 'v2', 'v1', 'v4'] }] },
    { name: 'припев 2', chords: CHORUS_C, acoustic: 'boy', power: true, bass: 'root8', drums: 'rock8', crash: true, fill: true, lines: [{ part: 'harmonica', phrases: ['c1', 'c2', 'c1', 'c4'] }] },
    { name: 'проигрыш', chords: ['Dm', 'Am', 'E', 'E'], acoustic: 'boyLight', bass: 'drive', drums: 'rock8Light', crash: true, fill: true, lines: [{ part: 'electric', phrases: ['solo1', 'solo2'] }] },
    { name: 'припев 3', chords: CHORUS_C, acoustic: 'boy', power: true, bass: 'root8', drums: 'rock8', crash: true, level: 1.05, lines: [{ part: 'harmonica', phrases: ['c1', 'c2', 'c1', 'c4'] }] },
    { name: 'финал', chords: ['Am'], acoustic: 'hit', bass: 'hit', crash: true },
  ],
  mix: { acoustic: -7, electric: -11, bass: -6, drums: -6, harmonica: -9 },
};

/** The only «попса» of the game: a drum machine on every beat, octave bass, a cheesy lead with a glide. */
const disco: TrackDef = {
  id: 'disco',
  title: 'Дискотека',
  bpm: 118,
  meter: [4, 4],
  key: 'Am',
  seed: 1987,
  lead: 0.2,
  tail: 2,
  tape: 0.6,
  room: 0.35,
  phrases: {
    d1: 'A4:.5 C5:.5 E5:.5 A5:.5 G5:.75 E5:.75 C5:.5 | F5:.5 E5:.5 C5:.5 A4:.5 C5:1 r:1',
    d2: 'B4:.5 D5:.5 G5:.5 B5:.5 A5:.75 G5:.75 D5:.5 | E5:1.5 G5:.5 B4:2',
    d4: 'B4:.5 D5:.5 G5:1 F5:.5 E5:.5 D5:1 | E5:.5 C5:.5 A4:3',
    e1: 'C6:1 A5:1 C6:.5 A5:.5 F5:1 | D6:1 B5:1 D6:.5 B5:.5 G5:1',
    e2: 'E6:1 C6:1 G5:1 E5:1 | A5:2 E5:1 C5:1',
    e4: 'G#5:1 B5:1 E6:1 D6:1 | C6:1 B5:1 A5:2',
  },
  sections: [
    { name: 'вступление', chords: ['Am', 'F', 'G', 'Am'], bass: 'octave8', drums: 'disco4', pad: true, crash: true, level: 0.85 },
    { name: 'куплет 1', chords: ['Am', 'F', 'G', 'Em', 'Am', 'F', 'G', 'Am'], bass: 'octave8', drums: 'disco4', pad: true, lines: [{ part: 'synthLead', phrases: ['d1', 'd2', 'd1', 'd4'] }] },
    { name: 'припев 1', chords: ['F', 'G', 'C', 'Am', 'F', 'G', 'E', 'Am'], bass: 'octave8', drums: 'disco4', pad: true, crash: true, lines: [{ part: 'synthLead', phrases: ['e1', 'e2', 'e1', 'e4'] }] },
    { name: 'куплет 2', chords: ['Am', 'F', 'G', 'Em', 'Am', 'F', 'G', 'Am'], bass: 'octave8', drums: 'disco4', pad: true, lines: [{ part: 'synthLead', phrases: ['d1', 'd2', 'd1', 'd4'] }] },
    { name: 'брейк', chords: ['Am', 'Am', 'F', 'G'], bass: 'root8', drums: 'discoBreak', pad: true, fill: true, level: 0.8 },
    { name: 'припев 2', chords: ['F', 'G', 'C', 'Am', 'F', 'G', 'E', 'Am'], bass: 'octave8', drums: 'disco4', pad: true, crash: true, level: 1.05, lines: [{ part: 'synthLead', phrases: ['e1', 'e2', 'e1', 'e4'] }] },
    { name: 'финал', chords: ['Am'], bass: 'hit', pad: true, crash: true },
  ],
  mix: { synthLead: -10, synthBass: -7, pad: -12, drums: -5 },
  bassVoice: 'synthBass',
};

const VERSE_T = ['Em', 'Am', 'D', 'G', 'C', 'Am', 'B7', 'Em'];
const CHORUS_T = ['C', 'D', 'G', 'Em', 'Am', 'B7', 'Em', 'Em'];

/** A tired ballad in 6/8 on the tape recorder: fingerpicking, harmonica, a soft rim and shaker in the choruses. */
const tape: TrackDef = {
  id: 'tape',
  title: 'Кассета',
  bpm: 174,
  meter: [6, 8],
  key: 'Em',
  seed: 1994,
  lead: 0.8,
  tail: 3.5,
  tape: 1,
  room: 0.4,
  phrases: {
    t1: 'B4:2 G4:1 E4:3 | E5:2 C5:1 A4:3',
    t2: 'F#4:2 A4:1 D5:3 | B4:2 A4:1 G4:3',
    t3: 'E5:3 D5:1 C5:2 | A4:4 B4:1 C5:1',
    t4: 'D#5:2 F#5:1 A5:3 | G5:2 F#5:1 E5:3',
    u1: 'G5:3 E5:3 | F#5:3 A5:3',
    u2: 'B5:2 A5:1 G5:3 | E5:6',
    u3: 'C6:2 B5:1 A5:3 | B5:2 A5:1 F#5:3',
    u4: 'G5:2 F#5:1 E5:3 | B4:3 E5:3',
    rest: 'r:6 | r:6',
    o1: 'r:6 | E5:3 G5:3 | F#5:3 D#5:3 | E5:6',
  },
  sections: [
    { name: 'вступление', chords: ['Em', 'C', 'G', 'B7'], acoustic: 'pick68', level: 0.8 },
    { name: 'куплет 1', chords: VERSE_T, acoustic: 'pick68', level: 0.85, lines: [{ part: 'harmonica', phrases: ['t1', 't2', 't3', 't4'] }] },
    { name: 'куплет 2', chords: VERSE_T, acoustic: 'pick68', bass: 'ballad', level: 0.85, lines: [{ part: 'harmonica', phrases: ['t1', 't2', 't3', 't4'] }] },
    { name: 'припев 1', chords: CHORUS_T, acoustic: 'pick68', bass: 'ballad', drums: 'ballad', level: 0.95, lines: [{ part: 'harmonica', phrases: ['u1', 'u2', 'u3', 'u4'] }] },
    { name: 'соло', chords: VERSE_T, acoustic: 'pick68', bass: 'ballad', drums: 'ballad', level: 0.95, lines: [{ part: 'harmonica', phrases: ['t1', 't2', 't3', 't4'] }] },
    { name: 'куплет 3', chords: VERSE_T, acoustic: 'pick68', bass: 'ballad', level: 0.8, lines: [{ part: 'harmonica', phrases: ['rest', 'rest', 't3', 't4'] }] },
    { name: 'припев 2', chords: CHORUS_T, acoustic: 'pick68', bass: 'ballad', drums: 'ballad', lines: [{ part: 'harmonica', phrases: ['u1', 'u2', 'u3', 'u4'] }] },
    { name: 'кода', chords: ['Em', 'C', 'B7', 'Em'], acoustic: 'pick68', bass: 'ballad', level: 0.8, lines: [{ part: 'harmonica', phrases: ['o1'] }] },
    { name: 'финал', chords: ['Em'], acoustic: 'hit', bass: 'hit', level: 0.8 },
  ],
  mix: { acoustic: -6, harmonica: -9, bass: -9, drums: -12 },
};

export const TRACKS: Readonly<Record<TrackId, TrackDef>> = { concert, disco, tape };
