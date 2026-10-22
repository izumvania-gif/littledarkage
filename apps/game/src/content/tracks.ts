/**
 * The cassette (concept «Музыка»): the band's three numbers, one a concert (cheerful, tired, quiet), the cheap
 * disco at Krypotkin's welcome, a tired ballad on the tape recorder, and the one loud thing in the game, the fast
 * angry instrumental the mutiny turns up to drown the general's orders. Own tunes in the spirit of the 90s army
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

const VERSE_2 = ['Am', 'Dm', 'G', 'C', 'F', 'Dm', 'E', 'E'];
const CHORUS_2 = ['Dm', 'Am', 'E', 'Am', 'Dm', 'Am', 'E', 'E'];

/**
 * «Усталый номер» for the second concert: the same band a battle later. A lazy shuffle at 84, the strum lighter,
 * no power chords; the drummer drags, the strummer is late to change chords, the harmonica misses a note here and
 * there and bends it back.
 */
const concert2: TrackDef = {
  id: 'concert2',
  title: 'Номер группы, второй',
  bpm: 84,
  meter: [4, 4],
  key: 'Am',
  seed: 1991,
  tuning: true,
  countIn: true,
  lead: 0.4,
  tail: 3.5,
  tape: 0.4,
  room: 0.5,
  swing: 0.55,
  drag: 0.03,
  slips: 0.8,
  phrases: {
    i1: 'A3:1 C4:.5 D4:.5 E4:2 | G4:.5 E4:.5 D4:1 C4:1 A3:1',
    i2: 'D4:1 F4:.5 A4:.5 D4:2 | E4:1 G#3:1 B3:1 r:1',
    w1: 'r:1 E5:1 D5:.5 C5:.5 A4:1 | F4:.5 A4:.5 D5:2 r:1',
    w2: 'r:1 D5:1 B4:.5 G4:.5 D5:1 | E5:2 C5:1 r:1',
    w3: 'r:1 C5:1 A4:.5 F4:.5 C5:1 | D5:1.5 F5:.5 D5:1 r:1',
    w4: 'r:1 B4:1 G#4:.5 B4:.5 D5:1 | E5:3 r:1',
    x1: 'F5:1.5 E5:.5 D5:1 A4:1 | C5:1.5 B4:.5 A4:2',
    x2: 'G#4:1 B4:1 E5:1 D5:1 | C5:2 r:2',
    x4: 'B4:1 D5:1 E5:1.5 D5:.5 | B4:3 r:1',
    s1: 'A4:2 G4:.5 F4:.5 D4:1 | E4:1 C4:1 A3:2',
    s2: 'B3:1 D4:1 E4:1 G#4:1 | E4:3 r:1',
  },
  sections: [
    { name: 'вступление', chords: ['Am', 'Am', 'Dm', 'E'], acoustic: 'boyLight', bass: 'ballad', drums: 'rock8Light', level: 0.85, lines: [{ part: 'electric', phrases: ['i1', 'i2'] }] },
    { name: 'куплет 1', chords: VERSE_2, acoustic: 'boyLight', bass: 'ballad', drums: 'rock8Light', fill: true, level: 0.85, lines: [{ part: 'harmonica', phrases: ['w1', 'w2', 'w3', 'w4'] }] },
    { name: 'припев 1', chords: CHORUS_2, acoustic: 'boy', bass: 'drive', drums: 'rock8', crash: true, fill: true, level: 0.95, lines: [{ part: 'harmonica', phrases: ['x1', 'x2', 'x1', 'x4'] }] },
    { name: 'проигрыш', chords: ['Dm', 'Am', 'E', 'E'], acoustic: 'boyLight', bass: 'ballad', drums: 'rock8Light', fill: true, level: 0.85, lines: [{ part: 'electric', phrases: ['s1', 's2'] }] },
    { name: 'куплет 2', chords: VERSE_2, acoustic: 'boyLight', bass: 'drive', drums: 'rock8Light', fill: true, level: 0.85, lines: [{ part: 'harmonica', phrases: ['w1', 'w2', 'w3', 'w4'] }] },
    { name: 'припев 2', chords: CHORUS_2, acoustic: 'boy', bass: 'drive', drums: 'rock8', crash: true, level: 0.95, lines: [{ part: 'harmonica', phrases: ['x1', 'x2', 'x1', 'x4'] }] },
    { name: 'финал', chords: ['Am'], acoustic: 'hit', bass: 'hit', crash: true, level: 0.85 },
  ],
  mix: { acoustic: -7, electric: -12, bass: -7, drums: -8, harmonica: -9 },
};

const VERSE_3 = ['Am', 'Dm', 'G', 'C', 'F', 'Dm', 'E', 'Am'];
const MIDDLE_3 = ['F', 'C', 'Dm', 'Am', 'F', 'C', 'E', 'E'];

/**
 * «Тихий номер» for the third concert: half the band is gone. No drums, no electric: the guitarist picks in 6/8,
 * the harmonica plays something that could be a lullaby, the bass comes in for a while and leaves. A worn tape.
 */
const concert3: TrackDef = {
  id: 'concert3',
  title: 'Номер группы, третий',
  bpm: 168,
  meter: [6, 8],
  key: 'Am',
  seed: 1993,
  tuning: 'guitar',
  lead: 1,
  tail: 4,
  tape: 0.8,
  room: 0.55,
  phrases: {
    l1: 'E5:3 C5:2 A4:1 | D5:3 F5:2 D5:1',
    l2: 'B4:3 D5:2 B4:1 | C5:4 r:2',
    l3: 'A4:3 C5:2 A4:1 | F4:3 A4:2 D5:1',
    l4: 'B4:2 G#4:1 E4:2 B4:1 | A4:6',
    m1: 'C6:3 A5:2 F5:1 | G5:3 E5:3',
    m2: 'F5:3 D5:2 A4:1 | C5:3 E5:3',
    m3: 'A5:2 G5:1 F5:2 A5:1 | G5:4 E5:2',
    m4: 'G#5:3 E5:2 D5:1 | B4:4 r:2',
    rest: 'r:6 | r:6',
    o1: 'r:6 | r:6 | B4:3 G#4:3 | A4:6',
  },
  sections: [
    { name: 'вступление', chords: ['Am', 'Dm', 'E', 'Am'], acoustic: 'pick68', level: 0.75 },
    { name: 'куплет 1', chords: VERSE_3, acoustic: 'pick68', level: 0.8, lines: [{ part: 'harmonica', phrases: ['l1', 'l2', 'l3', 'l4'] }] },
    { name: 'куплет 2', chords: VERSE_3, acoustic: 'pick68', bass: 'ballad', level: 0.85, lines: [{ part: 'harmonica', phrases: ['l1', 'l2', 'l3', 'l4'] }] },
    { name: 'проигрыш', chords: ['Am', 'Dm', 'E', 'Am'], acoustic: 'pick68', bass: 'ballad', level: 0.75 },
    { name: 'середина', chords: MIDDLE_3, acoustic: 'pick68', bass: 'ballad', level: 0.9, lines: [{ part: 'harmonica', phrases: ['m1', 'm2', 'm3', 'm4'] }] },
    { name: 'куплет 3', chords: VERSE_3, acoustic: 'pick68', level: 0.75, lines: [{ part: 'harmonica', phrases: ['rest', 'l2', 'l3', 'l4'] }] },
    { name: 'кода', chords: ['Am', 'Dm', 'E', 'Am'], acoustic: 'pick68', level: 0.65, lines: [{ part: 'harmonica', phrases: ['o1'] }] },
    { name: 'финал', chords: ['Am'], acoustic: 'hit', level: 0.6 },
  ],
  mix: { acoustic: -6, harmonica: -11, bass: -12 },
};

const VERSE_R = ['Em', 'C', 'G', 'D', 'Em', 'C', 'B7', 'B7'];
const CHORUS_R = ['C', 'D', 'Em', 'Em', 'C', 'D', 'B7', 'B7'];

/**
 * The mutiny: the band's fast angry instrumental, the only loud music in the game, put on at full by whoever
 * reaches the tape recorder. A yard punk beat at 152, open power chords with more drive, the harmonica screaming
 * the riff. The riff alone opens it once; from the band's entry it loops without a seam for as long as the fight lasts.
 */
const riot: TrackDef = {
  id: 'riot',
  title: 'Бунт',
  bpm: 152,
  meter: [4, 4],
  key: 'Em',
  seed: 1917,
  countIn: true,
  lead: 0.15,
  tail: 2.5,
  tape: 0.35,
  room: 0.3,
  drive: 6,
  loop: { from: 1, to: 9 },
  phrases: {
    ri1: 'E3:.5 E3:.5 G3:.5 E3:.5 A3:.5 G3:.5 E3:1 | D3:.5 E3:.5 G3:.5 B3:.5 A3:1 G3:1',
    rr1: 'E5:.5 E5:.5 G5:.5 E5:.5 A5:.5 G5:.5 E5:1 | D5:.5 E5:.5 G5:.5 B5:.5 A5:1 G5:1',
    rr2: 'G5:.5 E5:.5 C5:1 A5:.5 F#5:.5 D5:1 | E5:2 B4:.5 D5:.5 E5:1',
    rv1: 'B4:1 E5:.5 G5:.5 F#5:1 E5:1 | G5:1.5 E5:.5 C5:2',
    rv2: 'D5:1 G5:.5 B5:.5 A5:1 G5:1 | F#5:1.5 A5:.5 D5:2',
    rv4: 'D#5:1 F#5:1 A5:1 F#5:1 | B5:3 r:1',
    rc1: 'E6:1.5 D6:.5 C6:1 G5:1 | F#5:1 A5:1 D6:2',
    rc2: 'E6:2 D6:.5 B5:.5 G5:1 | E5:3 r:1',
    rc4: 'D#6:1.5 B5:.5 A5:1 F#5:1 | B5:4',
    rb1: 'A5:3 G5:.5 E5:.5 | A5:2 C6:2',
    rb2: 'B5:3 A5:.5 F#5:.5 | D#5:2 F#5:2',
    so1: 'E4:.5 G4:.5 A4:.5 B4:.5 D5:1 B4:1 | C5:1 B4:.5 A4:.5 G4:1 E4:1',
    so2: 'D5:.5 B4:.5 G4:.5 B4:.5 D5:1 G5:1 | F#5:2 D5:1 A4:1',
    so3: 'G5:1.5 F#5:.5 E5:1 D5:1 | E5:1 C5:1 G4:2',
    so4: 'F#4:.5 A4:.5 B4:.5 D#5:.5 F#5:1 D#5:1 | B4:4',
  },
  sections: [
    { name: 'рифф один', chords: ['Em', 'Em'], level: 0.9, lines: [{ part: 'electric', phrases: ['ri1'] }] },
    { name: 'рифф', chords: ['Em', 'Em', 'C D', 'Em'], acoustic: 'boy', power: true, bass: 'root8', drums: 'punk', crash: true, fill: true, lines: [{ part: 'harmonica', phrases: ['rr1', 'rr2'] }] },
    { name: 'куплет 1', chords: VERSE_R, acoustic: 'boy', power: true, bass: 'root8', drums: 'punk', fill: true, level: 0.92, lines: [{ part: 'harmonica', phrases: ['rv1', 'rv2', 'rv1', 'rv4'] }] },
    { name: 'припев 1', chords: CHORUS_R, acoustic: 'boy', power: 'open', bass: 'root8', drums: 'punk', crash: true, fill: true, level: 1.05, lines: [{ part: 'harmonica', phrases: ['rc1', 'rc2', 'rc1', 'rc4'] }] },
    { name: 'рифф 2', chords: ['Em', 'Em', 'C D', 'Em'], acoustic: 'boy', power: true, bass: 'root8', drums: 'punk', crash: true, fill: true, lines: [{ part: 'harmonica', phrases: ['rr1', 'rr2'] }] },
    { name: 'ломка', chords: ['Am', 'Am', 'B7', 'B7'], power: 'open', bass: 'root8', drums: 'half', crash: true, fill: true, level: 0.95, lines: [{ part: 'harmonica', phrases: ['rb1', 'rb2'] }] },
    { name: 'соло', chords: VERSE_R, acoustic: 'boy', bass: 'root8', drums: 'punk', crash: true, fill: true, lines: [{ part: 'electric', phrases: ['so1', 'so2', 'so3', 'so4'] }] },
    { name: 'куплет 2', chords: VERSE_R, acoustic: 'boy', power: true, bass: 'root8', drums: 'punk', fill: true, level: 0.92, lines: [{ part: 'harmonica', phrases: ['rv1', 'rv2', 'rv1', 'rv4'] }] },
    { name: 'припев 2', chords: CHORUS_R, acoustic: 'boy', power: 'open', bass: 'root8', drums: 'punk', crash: true, fill: true, level: 1.05, lines: [{ part: 'harmonica', phrases: ['rc1', 'rc2', 'rc1', 'rc4'] }] },
    { name: 'финал', chords: ['Em'], acoustic: 'hit', bass: 'hit', crash: true },
  ],
  mix: { acoustic: -11, electric: -8, bass: -6, drums: -5, harmonica: -9 },
};

export const TRACKS: Readonly<Record<TrackId, TrackDef>> = { concert, disco, tape, concert2, concert3, riot };
