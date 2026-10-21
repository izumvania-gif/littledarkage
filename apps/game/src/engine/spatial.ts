/**
 * Battle sounds around the listener (concept «Ударник», «Доступность»): coordinators' signals, creatures,
 * steps and touch, placed in space. Headphones get HRTF; speakers and mono get plain panning, and a sound
 * behind is muffled (the screen says «сзади» in the captions). Everything is synthesized, nothing recorded.
 * HRTF only for what matters; the rest pans cheaply.
 */
import type { AudioEngine, Bus } from './audio.ts';

/** A point around the listener in cells: x to the right, z ahead (negative is behind). */
export interface Spot {
  x: number;
  z: number;
}

export type Signal = 'whistle' | 'snap' | 'cough' | 'pipe';

interface ToneOpts {
  freq: number;
  to?: number;
  type?: OscillatorType;
  dur: number;
  gain?: number;
  attack?: number;
  at?: number;
  spot?: Spot;
  bus?: Bus;
}

interface NoiseOpts {
  dur: number;
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
  attack?: number;
  at?: number;
  spot?: Spot;
  bus?: Bus;
}

/** ±k random variation, so repeated sounds don't machine-gun. */
const vary = (k = 0.08) => 1 + (Math.random() * 2 - 1) * k;

export class BattleSound {
  private readonly audio: AudioEngine;

  constructor(audio: AudioEngine) {
    this.audio = audio;
  }

  get now(): number {
    return this.audio.context?.currentTime ?? 0;
  }

  /** Where a one-shot plugs in: a bus, or a panner at a spot around the listener. */
  private dest(spot?: Spot, bus: Bus = 'sfx', precise = true): AudioNode | null {
    const ctx = this.audio.context;
    const target = this.audio.bus(bus);
    if (!ctx || !target) return null;
    if (!spot) return target;
    const headphones = this.audio.output === 'headphones';
    const p = ctx.createPanner();
    p.panningModel = headphones && precise ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 1;
    p.rolloffFactor = 0.8;
    // The listener faces -Z, so «ahead» is negative z in Web Audio.
    p.positionX.value = spot.x;
    p.positionY.value = 0;
    p.positionZ.value = -spot.z;
    p.connect(target);
    if (!headphones && spot.z < -0.2) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;
      lp.connect(p);
      return lp;
    }
    return p;
  }

  tone(o: ToneOpts): void {
    const ctx = this.audio.context;
    const dest = this.dest(o.spot, o.bus);
    if (!ctx || !dest) return;
    const t = o.at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.3, t + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  noise(o: NoiseOpts): void {
    const ctx = this.audio.context;
    const buf = this.audio.noiseBuffer;
    const dest = this.dest(o.spot, o.bus);
    if (!ctx || !buf || !dest) return;
    const t = o.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 1200, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur);
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.3, t + (o.attack ?? 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.05);
  }

  // ---------- the battle's sounds ----------

  /** The relay of the red lamp; from the coordinators' zone it is the striker's fixed beacon. */
  lamp(spot?: Spot): void {
    this.noise({ dur: 0.03, filter: 'highpass', freq: 2500, gain: 0.35, spot });
    this.tone({ freq: 1900 * vary(), dur: 0.04, gain: 0.08, type: 'square', spot });
  }

  step(spot?: Spot, gain = 0.32): void {
    this.noise({ dur: 0.09, freq: 320 * vary(), gain, spot });
    this.noise({ dur: 0.05, filter: 'bandpass', freq: 2200 * vary(), q: 1.2, gain: gain * 0.35, spot, at: this.now + 0.01 });
  }

  /** Paper crushed underfoot: a creature dies. Wet and long. */
  crunch(spot?: Spot): void {
    for (let i = 0; i < 7; i++) this.noise({ dur: 0.05 + Math.random() * 0.05, filter: 'bandpass', freq: 900 + Math.random() * 2600, q: 2, gain: 0.32, spot, at: this.now + i * 0.035 + Math.random() * 0.02 });
    this.noise({ dur: 0.35, freq: 260, gain: 0.25, spot });
  }

  /** Dry paper and a small chime: a secret, a folded letter someone dropped in the dark. */
  paper(spot?: Spot): void {
    for (let i = 0; i < 4; i++) this.noise({ dur: 0.03, filter: 'highpass', freq: 3500 + Math.random() * 2500, gain: 0.18, spot, at: this.now + i * 0.03 });
    this.tone({ freq: 2640, dur: 0.5, gain: 0.05, spot, at: this.now + 0.12 });
  }

  /** A secret glinting in a flash. */
  glint(spot?: Spot): void {
    this.tone({ freq: 2640 * vary(0.03), dur: 0.35, gain: 0.04, spot });
    this.tone({ freq: 3960 * vary(0.03), dur: 0.25, gain: 0.025, spot, at: this.now + 0.05 });
  }

  /** A creature crawling: dry scraping paper. */
  rustle(spot?: Spot, dur = 0.6, gain = 0.2): void {
    for (let i = 0; i < Math.round(dur * 10); i++) this.noise({ dur: 0.08, filter: 'bandpass', freq: 2600 * vary(0.3), q: 3, gain: gain * (0.5 + Math.random() * 0.5), spot, at: this.now + i * 0.1 * vary(0.3) });
  }

  thud(spot?: Spot): void {
    this.tone({ freq: 90 * vary(), to: 45, dur: 0.25, gain: 0.5, spot });
    this.noise({ dur: 0.12, freq: 500, gain: 0.3, spot });
  }

  /** The floor gives way: a pit. */
  sag(spot?: Spot): void {
    this.tone({ freq: 140, to: 60, type: 'sawtooth', dur: 0.5, gain: 0.12, spot });
    this.noise({ dur: 0.45, freq: 400, to: 120, gain: 0.3, spot });
  }

  /** A mine: a dull pop under the floor. */
  pop(spot?: Spot): void {
    this.noise({ dur: 0.4, freq: 900, to: 90, gain: 0.6, spot });
    this.tone({ freq: 70, to: 35, dur: 0.4, gain: 0.5, spot });
  }

  /** A snare: a wire twang. */
  twang(spot?: Spot): void {
    this.tone({ freq: 330, to: 310, type: 'triangle', dur: 0.6, gain: 0.15, spot });
    this.tone({ freq: 990, to: 930, dur: 0.3, gain: 0.05, spot });
  }

  /** The sack thrown over something that squirms. */
  sack(spot?: Spot): void {
    this.noise({ dur: 0.3, filter: 'bandpass', freq: 700, q: 0.7, gain: 0.35, spot });
    this.rustle(spot, 0.8, 0.12);
  }

  /** «Ай!» without a voice: a short vocal blip through two formants. `pitch` tells soldiers apart. */
  cry(spot?: Spot, pitch = 1): void {
    const ctx = this.audio.context;
    const dest = this.dest(spot);
    if (!ctx || !dest) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320 * pitch * vary(0.05), t);
    osc.frequency.exponentialRampToValueAtTime(220 * pitch, t + 0.28);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    for (const [f, q] of [
      [800, 6],
      [1250, 8],
    ] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      osc.connect(bp).connect(g);
    }
    g.connect(dest);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  /** A coordinator's signal before his line: whistle, finger snap, cough or a knock on the pipe. */
  signal(kind: Signal, spot?: Spot): void {
    const now = this.now;
    switch (kind) {
      case 'whistle':
        this.tone({ freq: 1750, to: 2250, dur: 0.18, gain: 0.12, spot });
        this.tone({ freq: 2250, to: 1900, dur: 0.22, gain: 0.12, spot, at: now + 0.2 });
        break;
      case 'snap':
        this.noise({ dur: 0.025, filter: 'highpass', freq: 3000, gain: 0.5, spot });
        this.noise({ dur: 0.025, filter: 'highpass', freq: 3000, gain: 0.5, spot, at: now + 0.14 });
        break;
      case 'cough':
        this.noise({ dur: 0.14, filter: 'bandpass', freq: 650, q: 2, gain: 0.45, spot });
        this.noise({ dur: 0.12, filter: 'bandpass', freq: 560, q: 2, gain: 0.35, spot, at: now + 0.2 });
        break;
      case 'pipe':
        for (const at of [0, 0.16]) {
          this.tone({ freq: 523, dur: 0.5, gain: 0.12, spot, at: now + at });
          this.tone({ freq: 1390, dur: 0.25, gain: 0.05, spot, at: now + at });
        }
        break;
    }
  }

  drip(spot?: Spot): void {
    this.tone({ freq: 1400 * vary(0.2), to: 700, dur: 0.12, gain: 0.05, spot, bus: 'ambience' });
  }

  /** One heartbeat (lub-dub), close and inside the head. */
  heart(gain = 0.5): void {
    this.tone({ freq: 58, to: 40, dur: 0.16, gain, bus: 'ui' });
    this.tone({ freq: 52, to: 38, dur: 0.14, gain: gain * 0.7, bus: 'ui', at: this.now + 0.2 });
  }

  /** The alarm siren that opens a battle. */
  siren(seconds = 2.5): void {
    const n = Math.max(1, Math.round(seconds / 1.2));
    for (let i = 0; i < n; i++) {
      this.tone({ freq: 520, to: 880, type: 'sawtooth', dur: 0.6, gain: 0.07, at: this.now + i * 1.2 });
      this.tone({ freq: 880, to: 520, type: 'sawtooth', dur: 0.6, gain: 0.07, at: this.now + i * 1.2 + 0.6 });
    }
  }

  uiTick(): void {
    this.tone({ freq: 880, dur: 0.05, gain: 0.08, type: 'triangle', bus: 'ui' });
  }
}

/** Words for where a sound came from, for the captions: «справа, близко», «сзади, далеко». */
export function where(spot: Spot): string {
  const a = Math.atan2(spot.x, spot.z);
  const d = Math.hypot(spot.x, spot.z);
  const sides = ['впереди', 'впереди справа', 'справа', 'сзади справа', 'сзади', 'сзади слева', 'слева', 'впереди слева'];
  const i = (Math.round(a / (Math.PI / 4)) + 8) % 8;
  return `${sides[i]}, ${d <= 1.5 ? 'близко' : d <= 3 ? 'рядом' : 'далеко'}`;
}
