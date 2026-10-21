/**
 * From a track's data (content/tracks.ts) to a list of timed notes and drum hits: the chord grid strummed,
 * picked and walked, the drum grids, and the melodies, which vary each time a phrase comes back. Seeded, so a
 * track is the same on every render. Pure: no Web Audio here (render.ts plays the score).
 */
import { seededRng } from '../../core/rng.ts';
import { DRUMS, PICKS, STRUMS, type BassId, type DrumHit, type DrumId, type PickId, type StrumId } from './patterns.ts';
import { atOrAbove, chord, midi, scale, type Chord } from './theory.ts';

export type TrackId = 'concert' | 'disco' | 'tape';

export type Part = 'acoustic' | 'electric' | 'bass' | 'drums' | 'harmonica' | 'synthLead' | 'synthBass' | 'pad';

/** A melodic line through a section: phrase names from the track's phrase book, played in order. */
export interface Line {
  part: Part;
  phrases: readonly string[];
}

export interface Section {
  name: string;
  /** One entry per bar; two chords in a bar are written «F G». */
  chords: readonly string[];
  acoustic?: StrumId | PickId;
  /** Palm-muted power chords on the overdriven electric, in eighths. */
  power?: boolean;
  bass?: BassId;
  drums?: DrumId;
  /** A drum fill in the section's last bar. */
  fill?: boolean;
  /** A crash cymbal on its first beat. */
  crash?: boolean;
  /** Sustained synth chords (the disco). */
  pad?: boolean;
  lines?: readonly Line[];
  /** Loudness of the section, 1 by default. */
  level?: number;
}

export interface TrackDef {
  id: TrackId;
  title: string;
  /** Beats per minute of the meter's unit: quarters in 4/4, eighths in 6/8. */
  bpm: number;
  meter: readonly [number, number];
  key: string;
  seed: number;
  /** The band tunes up before the count-in (concept: «Номер группы начинается с настройки инструментов»). */
  tuning?: boolean;
  /** One bar of drumsticks before the first bar. */
  countIn?: boolean;
  /** Silence (tape hiss only) before the first sound, seconds. */
  lead: number;
  /** Ringing after the last bar, seconds. */
  tail: number;
  /** How much of the cassette is heard: 0 a live band in the room, 1 a worn tape (hiss, wow, dull highs). */
  tape: number;
  /** Room reverb, 0..1. */
  room: number;
  /** Phrases as «E5:1 D5:.5 r:1 …», durations in beats of the meter's unit; bar lines «|» are only for reading. */
  phrases: Readonly<Record<string, string>>;
  sections: readonly Section[];
  /** Level of each part in dB before the mix is normalized. */
  mix: Readonly<Partial<Record<Part, number>>>;
  /** What plays the bass lines: the bass guitar, or the disco's synth bass. */
  bassVoice?: 'bass' | 'synthBass';
}

export interface Note {
  kind: 'note';
  t: number;
  part: Part;
  midi: number;
  /** Seconds; a plucked string also stops when the same string is plucked again. */
  dur: number;
  vel: number;
  /** Guitar string 0..5 (low to high) for voice stealing; melodic lines are monophonic without one. */
  string?: number;
  /** A palm-muted or chopped string: short and dull. */
  mute?: boolean;
  /** The hand slapping the strings dead (the first string of a chop). */
  slap?: boolean;
  /** Slides from this note (portamento of the disco lead). */
  glideFrom?: number;
  /** Starts this many cents off and moves to centsTo over bendTime (a bend, or a string being tuned). */
  cents?: number;
  centsTo?: number;
  bendTime?: number;
}

export interface Hit {
  kind: 'hit';
  t: number;
  hit: DrumHit;
  vel: number;
}

export type ScoreEvent = Note | Hit;

export interface Score {
  id: TrackId;
  /** Seconds per beat of the meter's unit. */
  beat: number;
  /** Seconds per bar. */
  bar: number;
  /** When the first bar starts (after tuning and the count-in). */
  start: number;
  duration: number;
  sections: { name: string; t: number; bars: number }[];
  events: ScoreEvent[];
}

/** Where each melodic part may play (MIDI), and the guitar's whole range. */
export const RANGES: Readonly<Record<Part, readonly [number, number]>> = {
  acoustic: [40, 90],
  electric: [40, 86],
  bass: [28, 52],
  drums: [0, 127],
  harmonica: [59, 89],
  synthLead: [57, 91],
  synthBass: [28, 52],
  pad: [52, 79],
};

export interface PhraseNote {
  /** MIDI, or null for a rest. */
  pitch: number | null;
  /** Beats. */
  dur: number;
}

export function parsePhrase(src: string): PhraseNote[] {
  return src
    .split(/[\s|]+/)
    .filter(Boolean)
    .map((tok) => {
      const [p = '', d = ''] = tok.split(':');
      const dur = Number(d);
      if (!(dur > 0)) throw new Error(`bad duration in «${tok}»`);
      return { pitch: p === 'r' ? null : midi(p), dur };
    });
}

export const phraseBeats = (notes: readonly PhraseNote[]): number => notes.reduce((s, n) => s + n.dur, 0);

/** Splits a bar's chord symbols: «F G» is two chords of half a bar each. */
export function barChords(entry: string): Chord[] {
  return entry.split(/\s+/).filter(Boolean).map(chord);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The next note of the key's scale above (dir 1) or below (dir -1) p. */
function scaleStep(p: number, dir: 1 | -1, keyScale: readonly number[]): number {
  let m = p + dir;
  while (!keyScale.includes(((m % 12) + 12) % 12)) m += dir;
  return m;
}

/** A semitone from a chord tone without being one: a neighbour that would grate on that chord. */
function clashes(p: number, c: Chord): boolean {
  const pc = ((p % 12) + 12) % 12;
  if (c.tones.includes(pc)) return false;
  return c.tones.some((t) => Math.abs(((t - pc + 18) % 12) - 6) === 5);
}

/**
 * A phrase coming back is played a little differently: a neighbour note instead of a passing one, a long note
 * turned around its upper or lower neighbour. Strong beats and the last note stay as written.
 */
export function vary(notes: readonly PhraseNote[], rnd: () => number, amount: number, barBeats: number, keyScale: readonly number[], chordAt: (beat: number) => Chord): PhraseNote[] {
  const out: PhraseNote[] = [];
  let beat = 0;
  notes.forEach((n, i) => {
    const last = i === notes.length - 1;
    const strong = beat % (barBeats / 2) === 0;
    const c = chordAt(beat);
    if (n.pitch !== null && !last && !strong && rnd() < amount * 0.4) {
      const alt = scaleStep(n.pitch, rnd() < 0.5 ? 1 : -1, keyScale);
      out.push({ pitch: clashes(alt, c) ? n.pitch : alt, dur: n.dur });
    } else if (n.pitch !== null && !last && n.dur >= barBeats / 4 && rnd() < amount * 0.35) {
      const alt = scaleStep(n.pitch, rnd() < 0.6 ? 1 : -1, keyScale);
      const ok = !clashes(alt, chordAt(beat + n.dur / 2));
      out.push({ pitch: n.pitch, dur: n.dur / 2 }, { pitch: ok ? alt : n.pitch, dur: n.dur / 4 }, { pitch: n.pitch, dur: n.dur / 4 });
    } else out.push({ ...n });
    beat += n.dur;
  });
  return out;
}

/** Builds the whole score of a track. */
export function buildScore(def: TrackDef): Score {
  const rnd = seededRng(def.seed);
  const [barBeats, unit] = def.meter;
  const beat = 60 / def.bpm;
  const bar = barBeats * beat;
  const keyScale = scale(def.key);
  const events: ScoreEvent[] = [];
  const note = (n: Omit<Note, 'kind'>) => events.push({ kind: 'note', ...n });
  const hit = (t: number, h: DrumHit, vel: number) => events.push({ kind: 'hit', t, hit: h, vel });
  const jitter = (ms: number) => (rnd() - 0.5) * 2 * ms * 0.001;

  let t = def.lead;
  if (def.tuning) t = tuning(t, note, hit);
  if (def.countIn) {
    for (let i = 0; i < barBeats; i += unit === 8 ? 3 : 1) hit(t + i * beat, 'sticks', i === 0 ? 0.9 : 0.75);
    t += bar;
  }
  const start = t;
  const sections: Score['sections'] = [];
  const seen = new Map<string, number>();

  def.sections.forEach((sec, si) => {
    const s0 = t;
    const level = sec.level ?? 1;
    const bars = sec.chords.map(barChords);
    const chordAt = (b: number): Chord => {
      const cs = bars[Math.min(bars.length - 1, Math.floor(b / barBeats))]!;
      return cs[Math.min(cs.length - 1, Math.floor(((b % barBeats) / barBeats) * cs.length))]!;
    };
    const nextRoot = (barIndex: number): number => {
      const next = bars[barIndex + 1]?.[0] ?? def.sections[si + 1]?.chords[0]?.split(/\s+/)[0];
      return typeof next === 'string' ? chord(next).root : (next?.root ?? chordAt(0).root);
    };

    bars.forEach((cs, bi) => {
      const tb = s0 + bi * bar;
      const lastBar = bi === bars.length - 1;
      const chordAtBeat = (b: number) => cs[Math.min(cs.length - 1, Math.floor((b / barBeats) * cs.length))]!;

      // Acoustic guitar: strummed in eighths (4/4) or picked (6/8).
      if (sec.acoustic && sec.acoustic in STRUMS) {
        const strokes = STRUMS[sec.acoustic as StrumId];
        const step = bar / strokes.length;
        strokes.forEach((stroke, k) => {
          if (stroke === '-') return;
          const c = chordAtBeat((k * barBeats) / strokes.length);
          strum(tb + k * step + jitter(4), stroke, c, level, note, rnd);
        });
      } else if (sec.acoustic && sec.acoustic in PICKS) {
        const picks = PICKS[sec.acoustic as PickId];
        const step = bar / picks.length;
        picks.forEach((p, k) => {
          const c = chordAtBeat((k * barBeats) / picks.length);
          const v = c.voicing;
          const s = p === 'B' ? v.findIndex((m) => m >= 0) : nearestString(v, p);
          if (s < 0) return;
          note({ t: tb + k * step + jitter(6), part: 'acoustic', midi: v[s]!, dur: bar * 2, vel: (p === 'B' ? 0.62 : 0.42 + rnd() * 0.08) * level, string: s });
        });
      }

      // Electric: palm-muted power chords on every eighth.
      if (sec.power) {
        for (let k = 0; k < 8; k++) {
          const c = chordAtBeat((k * barBeats) / 8);
          const low = c.root >= 4 && c.root <= 7;
          const root = atOrAbove(c.root, low ? 40 : 45);
          const strings = low ? [0, 1, 2] : [1, 2, 3];
          [root, root + 7, root + 12].forEach((m, j) =>
            note({ t: tb + k * (bar / 8) + j * 0.004 + jitter(3), part: 'electric', midi: m, dur: 0.12, vel: (k % 2 === 0 ? 0.8 : 0.6) * level, string: strings[j]!, mute: true }),
          );
        }
      }

      // Bass.
      if (sec.bass) bassBar(sec.bass, def.bassVoice ?? 'bass', tb, bar, barBeats, beat, cs, nextRoot(bi), level, note, jitter);

      // Drums: the section's grid, a fill in its last bar, a crash on its first beat.
      if (sec.drums) {
        const id: DrumId = sec.fill && lastBar ? (unit === 8 ? 'fill68' : 'fill44') : sec.drums;
        for (const [h, grid] of Object.entries(DRUMS[id]) as [DrumHit, string][]) {
          const step = bar / grid.length;
          for (let k = 0; k < grid.length; k++) {
            const ch = grid[k];
            if (ch === '.') continue;
            hit(tb + k * step + (k === 0 ? 0 : jitter(3)), h, (ch === 'X' ? 1 : 0.7) * level * (0.92 + rnd() * 0.08));
          }
        }
      }
      if (sec.crash && bi === 0) hit(tb, 'crash', 0.85 * level);

      // Pad: the chord held, mid register.
      if (sec.pad) {
        cs.forEach((c, j) => {
          const span = bar / cs.length;
          const tones = c.tones.slice(0, 3).map((pc) => atOrAbove(pc, 57)).sort((a, b) => a - b);
          for (const m of tones) note({ t: tb + j * span, part: 'pad', midi: m, dur: span * 0.98, vel: 0.5 * level });
        });
      }
    });

    // Melodic lines: phrases one after another from the section's start; a phrase met again is varied.
    for (const line of sec.lines ?? []) {
      let lt = s0;
      let prev: number | null = null;
      for (const name of line.phrases) {
        const src = def.phrases[name];
        if (src === undefined) throw new Error(`no phrase ${name} in ${def.id}`);
        let notes = parsePhrase(src);
        const occ = seen.get(`${line.part}:${name}`) ?? 0;
        seen.set(`${line.part}:${name}`, occ + 1);
        const phraseStart = (lt - s0) / beat;
        if (occ > 0) notes = vary(notes, seededRng(def.seed ^ hash(name) ^ (occ * 7919)), 0.7, barBeats, keyScale, (b) => chordAt(phraseStart + b));
        let nb = 0;
        for (const n of notes) {
          const at = lt + nb * beat;
          if (n.pitch !== null) {
            const strongBeat = (phraseStart + nb) % barBeats === 0;
            const long = n.dur >= barBeats / 2;
            const ev: Omit<Note, 'kind'> = { t: at + jitter(5), part: line.part, midi: n.pitch, dur: n.dur * beat * (line.part === 'harmonica' ? 0.97 : 0.92), vel: (strongBeat ? 0.85 : 0.72) * level };
            if (line.part === 'synthLead' && prev !== null && Math.abs(prev - n.pitch) <= 7) ev.glideFrom = prev;
            if ((line.part === 'harmonica' || line.part === 'electric') && long && rnd() < 0.45) {
              ev.cents = -45;
              ev.centsTo = 0;
              ev.bendTime = Math.min(0.18, n.dur * beat * 0.3);
            }
            note(ev);
            prev = n.pitch;
          } else prev = null;
          nb += n.dur;
        }
        lt += nb * beat;
      }
    }

    sections.push({ name: sec.name, t: s0, bars: bars.length });
    t = s0 + bars.length * bar;
  });

  events.sort((a, b) => a.t - b.t);
  return { id: def.id, beat, bar, start, duration: t + def.tail, sections, events };
}

/** The string a picked note lands on, or the nearest higher one that the chord plays. */
function nearestString(v: readonly number[], s: number): number {
  for (let i = s; i < v.length; i++) if (v[i]! >= 0) return i;
  for (let i = s - 1; i >= 0; i--) if (v[i]! >= 0) return i;
  return -1;
}

type Emit = (n: Omit<Note, 'kind'>) => void;

/** One stroke of the strum: strings one after another, a few milliseconds apart. */
function strum(t: number, stroke: 'D' | 'U' | 'X' | 'B', c: Chord, level: number, note: Emit, rnd: () => number): void {
  const v = c.voicing;
  const played = v.map((m, s) => [m, s] as const).filter(([m]) => m >= 0);
  if (stroke === 'B') {
    const [m, s] = played[0]!;
    note({ t, part: 'acoustic', midi: m, dur: 3, vel: 0.65 * level, string: s });
    return;
  }
  if (stroke === 'D') {
    played.forEach(([m, s], k) => note({ t: t + k * 0.007, part: 'acoustic', midi: m, dur: 3, vel: (0.66 + rnd() * 0.12) * level * (k === 0 ? 1.1 : 1), string: s }));
    return;
  }
  if (stroke === 'U') {
    played
      .filter(([, s]) => s >= 2)
      .reverse()
      .forEach(([m, s], k) => note({ t: t + k * 0.006, part: 'acoustic', midi: m, dur: 3, vel: (0.38 + rnd() * 0.08) * level, string: s }));
    return;
  }
  // A chop: the hand slaps the strings dead.
  played.forEach(([m, s], k) => note({ t: t + k * 0.003, part: 'acoustic', midi: m, dur: 0.05, vel: 0.5 * level, string: s, mute: true, ...(k === 0 ? { slap: true } : {}) }));
}

function bassBar(id: BassId, voice: 'bass' | 'synthBass', tb: number, bar: number, barBeats: number, beat: number, cs: readonly Chord[], next: number, level: number, note: Emit, jitter: (ms: number) => number): void {
  const root = (c: Chord) => atOrAbove(c.root, 28);
  const at = (b: number) => cs[Math.min(cs.length - 1, Math.floor((b / barBeats) * cs.length))]!;
  const play = (b: number, m: number, dur: number, vel: number) => note({ t: tb + b * beat + (b === 0 ? 0 : jitter(4)), part: voice, midi: m, dur, vel: vel * level });
  switch (id) {
    case 'root8':
      for (let k = 0; k < barBeats * 2; k++) play(k / 2, root(at(k / 2)), beat * 0.45, k % 2 ? 0.62 : 0.78);
      break;
    case 'octave8':
      for (let k = 0; k < barBeats * 2; k++) play(k / 2, root(at(k / 2)) + (k % 2 ? 12 : 0), beat * 0.42, k % 2 ? 0.6 : 0.8);
      break;
    case 'drive': {
      // Root, root, fifth, and a step into the next chord's root.
      for (let k = 0; k < barBeats; k++) {
        const c = at(k);
        let m = root(c);
        if (k === 2) m += 7;
        if (k === 3) {
          const target = atOrAbove(next, 28);
          m = target - (target > root(c) ? 1 : -1) * 2;
          if (m < 28) m += 12;
        }
        play(k, m, beat * 0.85, k === 0 ? 0.85 : 0.68);
      }
      break;
    }
    case 'ballad':
      play(0, root(at(0)), beat * 2.8, 0.75);
      play(barBeats / 2, root(at(barBeats / 2)) + 7, beat * 2.6, 0.6);
      break;
    case 'hit':
      play(0, root(at(0)), bar * 1.5, 0.9);
      break;
  }
}

/** The band tuning up: a string slid into pitch, a reference string, the bass, the drums checked. Returns when the count-in may start. */
function tuning(t: number, note: Emit, hit: (t: number, h: DrumHit, vel: number) => void): number {
  note({ t: t + 0.4, part: 'acoustic', midi: 45, dur: 2.2, vel: 0.55, string: 1, cents: -42, centsTo: -9, bendTime: 1.4 });
  note({ t: t + 1.0, part: 'acoustic', midi: 40, dur: 2.0, vel: 0.4, string: 0 });
  note({ t: t + 2.0, part: 'acoustic', midi: 45, dur: 1.6, vel: 0.5, string: 1, cents: -9, centsTo: 0, bendTime: 0.6 });
  note({ t: t + 2.9, part: 'electric', midi: 57, dur: 1.3, vel: 0.45, string: 3, cents: 28, centsTo: 0, bendTime: 0.9 });
  note({ t: t + 3.8, part: 'bass', midi: 28, dur: 1.1, vel: 0.7 });
  note({ t: t + 4.3, part: 'bass', midi: 33, dur: 0.9, vel: 0.6, cents: -22, centsTo: 0, bendTime: 0.5 });
  hit(t + 4.9, 'kick', 0.7);
  hit(t + 5.2, 'kick', 0.8);
  hit(t + 5.5, 'snare', 0.55);
  hit(t + 5.75, 'hatC', 0.4);
  hit(t + 5.9, 'hatC', 0.35);
  const c = chord('Am');
  c.voicing.forEach((m, s) => {
    if (m >= 0) note({ t: t + 6.2 + s * 0.008, part: 'acoustic', midi: m, dur: 0.5, vel: 0.45, string: s });
  });
  return t + 7.2;
}
