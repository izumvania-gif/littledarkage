/**
 * Every note of a part is synthesized straight into that part's sample buffer here, in plain JavaScript:
 * a node per note in the Web Audio graph made a two-minute render take longer than the music itself, because
 * finished notes' filters kept running. Plucks are read from Karplus–Strong samples (with a pitch bend if asked),
 * reeds and synths are band-limited oscillators (PolyBLEP) with their envelopes and filters. Pure functions.
 */
import { biquad } from './dsp.ts';
import { hz } from './theory.ts';

/** Adds a sample at time t, read at a pitch that moves from `cents` to `centsTo` over `bendTime`; it fades from `endAt` with time constant `release`. */
export function addPluck(out: Float32Array, sr: number, sample: Float32Array, t: number, vel: number, endAt: number, release: number, bend?: { cents: number; centsTo: number; bendTime: number }): void {
  const start = Math.floor(t * sr);
  const end = Math.floor(endAt * sr);
  const decay = Math.exp(-1 / Math.max(1, release * sr));
  let g = vel;
  let pos = 0;
  const bendSamples = bend ? Math.max(1, bend.bendTime * sr) : 0;
  for (let i = start; i < out.length; i++) {
    const k = Math.floor(pos);
    if (k + 1 >= sample.length) break;
    const f = pos - k;
    out[i]! += g * (sample[k]! + (sample[k + 1]! - sample[k]!) * f);
    if (i >= end) {
      g *= decay;
      if (g < 1e-4) break;
    }
    if (bend) {
      const n = i - start;
      const c = n >= bendSamples ? bend.centsTo : bend.cents + ((bend.centsTo - bend.cents) * n) / bendSamples;
      pos += 2 ** (c / 1200);
    } else pos += 1;
  }
}

/** Adds a one-shot (a drum) at time t; with endAt it is choked there (an open hi-hat closed by the next one). */
export function addShot(out: Float32Array, sr: number, sample: Float32Array, t: number, gain: number, endAt = Infinity): void {
  const start = Math.floor(t * sr);
  const end = Number.isFinite(endAt) ? Math.floor(endAt * sr) : Infinity;
  let g = gain;
  const choke = Math.exp(-1 / (0.012 * sr));
  for (let k = 0; k < sample.length && start + k < out.length; k++) {
    if (start + k >= end) {
      g *= choke;
      if (g < 1e-4) break;
    }
    out[start + k]! += g * sample[k]!;
  }
}

/** PolyBLEP correction at a discontinuity, for alias-free saws and squares. */
function blep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

const saw = (phase: number, dt: number) => 2 * phase - 1 - blep(phase, dt);
const square = (phase: number, dt: number) => (phase < 0.5 ? 1 : -1) + blep(phase, dt) - blep((phase + 0.5) % 1, dt);

/** A cheap seeded noise generator for breath and slaps. */
function noiseGen(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2147483648 - 1;
  };
}

export interface Voice {
  t: number;
  midi: number;
  dur: number;
  vel: number;
  cents?: number;
  centsTo?: number;
  bendTime?: number;
  glideFrom?: number;
}

/** Linear attack, hold, exponential release: the gain at time x seconds into a note of length dur. */
function envelope(x: number, dur: number, attack: number, release: number): number {
  if (x < attack) return x / attack;
  if (x < dur) return 1;
  return Math.exp(-(x - dur) / release);
}

/** A blown reed: saw and detuned pulse, a bend into pitch, vibrato that grows on a held note, breath noise. The mouth's formant is on the part's chain. */
export function addHarmonica(out: Float32Array, sr: number, v: Voice, seed: number): void {
  const f0 = hz(v.midi);
  const start = Math.floor(v.t * sr);
  const total = Math.floor((v.dur + 0.5) * sr);
  const noise = noiseGen(seed);
  const bp = biquad('bandpass', 2200, 0.8, sr);
  const vibAt = Math.min(0.5, v.dur * 0.6) + 0.15;
  const vibStep = (2 * Math.PI * 5.3) / sr;
  const bendTime = v.bendTime ?? 0.1;
  const centsTo = v.centsTo ?? 0;
  const settled = 2 ** ((v.cents !== undefined ? centsTo : 0) / 1200);
  let p1 = 0;
  let p2 = 0;
  let vib = 0;
  const amp = 0.32 * v.vel;
  for (let n = 0; n < total && start + n < out.length; n++) {
    const x = n / sr;
    const env = envelope(x, v.dur, 0.045, 0.06);
    if (x > v.dur && env < 1e-4) break;
    // A bend moves the pitch only for its first fraction of a second; after that the ratio is fixed.
    const ratio = v.cents !== undefined && x < bendTime ? 2 ** ((v.cents + (centsTo - v.cents) * (x / bendTime)) / 1200) : settled;
    vib += vibStep;
    const depth = x < vibAt ? 0.0065 * (x / vibAt) : 0.0065;
    const f = f0 * ratio * (1 + depth * Math.sin(vib));
    const dt1 = f / sr;
    const dt2 = (f * 2 ** (4 / 1200)) / sr;
    p1 = (p1 + dt1) % 1;
    p2 = (p2 + dt2) % 1;
    const tone = 0.7 * saw(p1, dt1) + 0.3 * square(p2, dt2);
    out[start + n]! += amp * env * (tone + 0.14 * bp(noise()));
  }
}

/** A biquad lowpass whose cutoff may move; coefficients are recomputed every 16 samples. */
function movingLowpass(sr: number, q: number): (x: number, cutoff: number) => number {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let a1 = 0;
  let a2 = 0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  let n = 0;
  return (x, cutoff) => {
    if (n++ % 16 === 0) {
      const w = (2 * Math.PI * Math.min(cutoff, sr * 0.45)) / sr;
      const cos = Math.cos(w);
      const alpha = Math.sin(w) / (2 * q);
      const a0 = 1 + alpha;
      b0 = (1 - cos) / 2 / a0;
      b1 = (1 - cos) / a0;
      b2 = b0;
      a1 = (-2 * cos) / a0;
      a2 = (1 - alpha) / a0;
    }
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

const DOWN7 = 2 ** (-7 / 1200);
const UP7 = 2 ** (7 / 1200);

/** The disco lead: two detuned saws and a square, a filter that opens on each note, a glide from the last note, late vibrato. */
export function addSynthLead(out: Float32Array, sr: number, v: Voice): void {
  const f0 = hz(v.midi);
  const from = v.glideFrom !== undefined ? hz(v.glideFrom) : f0;
  const start = Math.floor(v.t * sr);
  const total = Math.floor((v.dur + 0.6) * sr);
  const lp = movingLowpass(sr, 3);
  let pa = 0;
  let pb = 0;
  let pc = 0;
  let vib = 0;
  const amp = 0.22 * v.vel;
  for (let n = 0; n < total && start + n < out.length; n++) {
    const x = n / sr;
    const env = envelope(x, v.dur, 0.012, 0.05);
    if (x > v.dur && env < 1e-4) break;
    const glide = x < 0.05 ? from * (f0 / from) ** (x / 0.05) : f0;
    vib += (2 * Math.PI * 5.8) / sr;
    const depth = x < 0.3 ? 0 : 0.005 * Math.min(1, (x - 0.3) / 0.3);
    const f = glide * (1 + depth * Math.sin(vib));
    const da = (f * DOWN7) / sr;
    const db = (f * UP7) / sr;
    const dc = f / sr;
    pa = (pa + da) % 1;
    pb = (pb + db) % 1;
    pc = (pc + dc) % 1;
    const s = 0.42 * saw(pa, da) + 0.42 * saw(pb, db) + 0.2 * square(pc, dc);
    const cutoff = x < 0.03 ? 900 * (3400 / 900) ** (x / 0.03) : 1900 + 1500 * Math.exp(-(x - 0.03) / 0.09);
    out[start + n]! += amp * env * lp(s, cutoff);
  }
}

/** The disco bass: a saw through a snappy resonant filter, with a sine under it. */
export function addSynthBass(out: Float32Array, sr: number, v: Voice): void {
  const f = hz(v.midi);
  const start = Math.floor(v.t * sr);
  const total = Math.floor((v.dur + 0.15) * sr);
  const lp = movingLowpass(sr, 5);
  let p = 0;
  let sub = 0;
  const dt = f / sr;
  for (let n = 0; n < total && start + n < out.length; n++) {
    const x = n / sr;
    const level = x < 0.005 ? (x / 0.005) * 0.5 : x < v.dur ? 0.32 + 0.18 * Math.exp(-(x - 0.005) / 0.08) : 0.32 * Math.exp(-(x - v.dur) / 0.02);
    if (x > v.dur && level < 1e-4) break;
    p = (p + dt) % 1;
    sub += 2 * Math.PI * dt;
    const cutoff = x < 0.008 ? 280 * (950 / 280) ** (x / 0.008) : 380 + 570 * Math.exp(-(x - 0.008) / 0.05);
    out[start + n]! += v.vel * level * (lp(saw(p, dt), cutoff) + 0.5 * Math.sin(sub));
  }
}

/** A pad note: two saws detuned apart, one to each side; the part's chain darkens it. */
export function addPad(left: Float32Array, right: Float32Array, sr: number, v: Voice): void {
  const f = hz(v.midi);
  const start = Math.floor(v.t * sr);
  const total = Math.floor((v.dur + 1.6) * sr);
  let pa = 0;
  let pb = 0;
  const dta = (f * 2 ** (-11 / 1200)) / sr;
  const dtb = (f * 2 ** (11 / 1200)) / sr;
  const amp = 0.09 * v.vel;
  for (let n = 0; n < total && start + n < left.length; n++) {
    const x = n / sr;
    const env = envelope(x, v.dur, 0.35, 0.3);
    if (x > v.dur && env < 1e-4) break;
    pa = (pa + dta) % 1;
    pb = (pb + dtb) % 1;
    const a = saw(pa, dta);
    const b = saw(pb, dtb);
    left[start + n]! += amp * env * (0.8 * a + 0.2 * b);
    right[start + n]! += amp * env * (0.2 * a + 0.8 * b);
  }
}

/** The slap of a chop: a short dry click under the dead strings. */
export function addSlap(out: Float32Array, sr: number, t: number, vel: number, seed: number): void {
  const start = Math.floor(t * sr);
  const noise = noiseGen(seed);
  const bp = biquad('bandpass', 1900, 0.9, sr);
  const total = Math.floor(0.04 * sr);
  for (let n = 0; n < total && start + n < out.length; n++) {
    const x = n / sr;
    const env = x < 0.002 ? x / 0.002 : Math.exp(-(x - 0.002) / 0.008);
    out[start + n]! += 0.9 * vel * env * bp(noise());
  }
}
