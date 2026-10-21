/**
 * Sample-level synthesis in plain JavaScript, rendered once into buffers: Karplus–Strong plucked strings
 * (guitars and bass) and the drum kit. Pure functions of a sample rate and a seed, so they're tested in Node.
 */
import { seededRng } from '../../core/rng.ts';
import type { DrumHit } from './patterns.ts';

export interface PluckOptions {
  /** 0 dull (a bass, a palm mute) .. 1 bright (a fresh steel string). */
  brightness: number;
  /** Seconds for the ring to fall by 60 dB. */
  t60: number;
  seconds: number;
  /** Where the string is plucked, as a fraction of its length (shapes the tone). */
  pick: number;
  seed: number;
}

/**
 * Karplus–Strong with a two-point damping average and an allpass for the fractional part of the period,
 * so the pitch stays in tune high up the neck. The burst is filtered noise with a pick-position comb.
 */
export function pluck(sr: number, freq: number, o: PluckOptions): Float32Array {
  const n = Math.floor(o.seconds * sr);
  const out = new Float32Array(n);
  const period = sr / freq;
  let len = Math.floor(period - 0.5);
  let frac = period - 0.5 - len;
  if (frac < 0.1) {
    len -= 1;
    frac += 1;
  }
  const c = (1 - frac) / (1 + frac);
  const rnd = seededRng(o.seed);
  const line = new Float32Array(len);
  const a = 0.12 + 0.85 * Math.max(0, Math.min(1, o.brightness));
  let y = 0;
  const burst = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    y += a * (rnd() * 2 - 1 - y);
    burst[i] = y;
  }
  const pd = Math.max(1, Math.round(o.pick * len));
  let mean = 0;
  for (let i = 0; i < len; i++) {
    line[i] = burst[i]! - 0.9 * (i >= pd ? burst[i - pd]! : 0);
    mean += line[i]!;
  }
  mean /= len;
  let peak = 1e-9;
  for (let i = 0; i < len; i++) {
    line[i]! -= mean;
    peak = Math.max(peak, Math.abs(line[i]!));
  }
  for (let i = 0; i < len; i++) line[i]! /= peak;
  const g = 10 ** (-3 / (o.t60 * freq));
  let idx = 0;
  let prev = 0;
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[idx]!;
    out[i] = cur;
    const avg = 0.5 * (cur + prev);
    prev = cur;
    const ap = c * avg + apX - c * apY;
    apX = avg;
    apY = ap;
    line[idx] = ap * g;
    if (++idx >= len) idx = 0;
  }
  fadeEdges(out, sr, 0.0015, 0.03);
  return out;
}

function fadeEdges(x: Float32Array, sr: number, fadeIn: number, fadeOut: number): void {
  const a = Math.min(x.length, Math.floor(fadeIn * sr));
  for (let i = 0; i < a; i++) x[i]! *= i / a;
  const b = Math.min(x.length, Math.floor(fadeOut * sr));
  for (let i = 0; i < b; i++) x[x.length - 1 - i]! *= i / b;
}

/** An RBJ biquad, one sample at a time (gainDb for the peaking type). */
export function biquad(type: 'lowpass' | 'highpass' | 'bandpass' | 'peaking', f: number, q: number, sr: number, gainDb = 0): (x: number) => number {
  const w = (2 * Math.PI * f) / sr;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0: number;
  let b1: number;
  let b2: number;
  let a0 = 1 + alpha;
  let a2 = 1 - alpha;
  if (type === 'peaking') {
    const A = 10 ** (gainDb / 40);
    b0 = 1 + alpha * A;
    b1 = -2 * cos;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a2 = 1 - alpha / A;
  } else if (type === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a1 = -2 * cos;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x: number) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/** Which kit: the band's acoustic drums, or the disco's drum machine. */
export type Kit = 'band' | 'machine';

/** Square-wave partials at the 808's cymbal ratios: the metal of a hi-hat or a crash. */
function metal(t: number, base: number): number {
  let s = 0;
  for (const r of [1, 1.4471, 1.6170, 1.9265, 2.5028, 2.6637]) s += Math.sin(2 * Math.PI * base * r * t) > 0 ? 1 : -1;
  return s / 6;
}

/** One drum hit as a mono sample. A few seeds per hit give the variation between strokes. */
export function drum(hit: DrumHit, kit: Kit, sr: number, seed: number): Float32Array {
  const rnd = seededRng(seed * 977 + hit.length * 131);
  const noise = () => rnd() * 2 - 1;
  const machine = kit === 'machine';
  const make = (seconds: number, fn: (t: number, i: number) => number) => {
    const out = new Float32Array(Math.floor(seconds * sr));
    for (let i = 0; i < out.length; i++) out[i] = fn(i / sr, i);
    fadeEdges(out, sr, 0.0005, 0.01);
    return out;
  };
  switch (hit) {
    case 'kick': {
      let phase = 0;
      const hp = biquad('highpass', 1500, 0.7, sr);
      const [low, sweep, decay] = machine ? [44, 95, 0.32] : [52, 85, 0.2];
      return make(machine ? 0.7 : 0.5, (t) => {
        const f = low + sweep * Math.exp(-t / 0.032);
        phase += (2 * Math.PI * f) / sr;
        return 0.95 * Math.sin(phase) * Math.exp(-t / decay) + 0.22 * hp(noise()) * Math.exp(-t / 0.0025);
      });
    }
    case 'snare': {
      const bp = biquad('bandpass', 2100, 0.7, sr);
      return make(0.4, (t) => 0.45 * Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t / 0.05) + 0.18 * Math.sin(2 * Math.PI * 330 * t) * Math.exp(-t / 0.03) + 0.85 * bp(noise()) * Math.exp(-t / 0.13));
    }
    case 'hatC':
    case 'hatO': {
      const hp = biquad('highpass', machine ? 8000 : 6800, 0.8, sr);
      const decay = hit === 'hatC' ? (machine ? 0.02 : 0.03) : 0.26;
      return make(hit === 'hatC' ? 0.15 : 0.6, (t) => hp(0.6 * noise() + 0.4 * metal(t, 410)) * Math.exp(-t / decay) * 0.8);
    }
    case 'clap': {
      const bp = biquad('bandpass', 1250, 1.1, sr);
      return make(0.32, (t) => {
        let env = 0;
        for (const at of [0, 0.011, 0.023]) if (t >= at) env = Math.max(env, Math.exp(-(t - at) / 0.0045));
        if (t >= 0.03) env = Math.max(env, 0.6 * Math.exp(-(t - 0.03) / 0.09));
        return 1.3 * bp(noise()) * env;
      });
    }
    case 'rim': {
      const hp = biquad('highpass', 2500, 0.7, sr);
      return make(0.09, (t) => 0.6 * Math.sin(2 * Math.PI * 1700 * t) * Math.exp(-t / 0.012) + 0.35 * hp(noise()) * Math.exp(-t / 0.006));
    }
    case 'shaker': {
      const bp = biquad('bandpass', 6200, 1.4, sr);
      return make(0.14, (t) => 0.9 * bp(noise()) * (t < 0.012 ? t / 0.012 : Math.exp(-(t - 0.012) / 0.04)));
    }
    case 'crash': {
      const hp = biquad('highpass', 3800, 0.6, sr);
      return make(2.6, (t) => hp(0.55 * noise() + 0.45 * metal(t, 330)) * Math.exp(-t / 1.0) * 0.75);
    }
    case 'sticks': {
      const bp = biquad('bandpass', 2600, 1.5, sr);
      return make(0.09, (t) => 0.55 * Math.sin(2 * Math.PI * 2100 * t) * Math.exp(-t / 0.02) + 0.3 * Math.sin(2 * Math.PI * 3300 * t) * Math.exp(-t / 0.012) + 0.4 * bp(noise()) * Math.exp(-t / 0.004));
    }
  }
}

/** A room for the reverb: stereo decaying noise, darker as it fades, with a few early reflections. */
export function roomImpulse(sr: number, seconds: number, seed: number): [Float32Array, Float32Array] {
  const rnd = seededRng(seed);
  const n = Math.floor(seconds * sr);
  const chans: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  for (const ch of chans) {
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const k = 0.9 - 0.75 * (t / seconds);
      lp += k * (rnd() * 2 - 1 - lp);
      ch[i] = lp * Math.exp(-t / (seconds / 4.5)) * 0.5;
    }
    for (const at of [0.011, 0.019, 0.027, 0.041]) {
      const i = Math.floor((at + rnd() * 0.004) * sr);
      if (i < n) ch[i]! += 0.35 * (rnd() < 0.5 ? -1 : 1);
    }
  }
  return chans;
}

/** Peak and RMS of a buffer's channels, in dBFS. */
export function levels(chans: readonly Float32Array[], from = 0, to = Infinity): { peak: number; rms: number } {
  let peak = 0;
  let sum = 0;
  let count = 0;
  for (const ch of chans) {
    const end = Math.min(ch.length, to);
    for (let i = Math.max(0, from); i < end; i++) {
      const v = ch[i]!;
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
      count++;
    }
  }
  const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  return { peak: db(peak), rms: db(Math.sqrt(sum / Math.max(1, count))) };
}

/**
 * A small room (Freeverb: eight damped combs and four allpasses per side), run over the whole reverb send at
 * once. Cheaper than a convolution over two minutes of music, and it never runs in the audio thread.
 */
export function freeverb(inL: Float32Array, inR: Float32Array, sr: number, size: number, damp: number): [Float32Array, Float32Array] {
  const scale = sr / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const alls = [556, 441, 341, 225];
  const feedback = 0.7 + 0.28 * Math.max(0, Math.min(1, size));
  const run = (input: Float32Array, spread: number): Float32Array => {
    const out = new Float32Array(input.length);
    const lines = combs.map((d) => ({ buf: new Float32Array(Math.round((d + spread) * scale)), i: 0, store: 0 }));
    const aps = alls.map((d) => ({ buf: new Float32Array(Math.round((d + spread) * scale)), i: 0 }));
    for (let n = 0; n < input.length; n++) {
      const x = input[n]! * 0.015;
      let s = 0;
      for (const c of lines) {
        const y = c.buf[c.i]!;
        c.store = y * (1 - damp) + c.store * damp;
        c.buf[c.i] = x + c.store * feedback;
        if (++c.i >= c.buf.length) c.i = 0;
        s += y;
      }
      for (const a of aps) {
        const b = a.buf[a.i]!;
        a.buf[a.i] = s + b * 0.5;
        s = b - s;
        if (++a.i >= a.buf.length) a.i = 0;
      }
      out[n] = s;
    }
    return out;
  };
  return [run(inL, 0), run(inR, 23)];
}
