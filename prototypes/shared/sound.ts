/**
 * Web Audio kit for the prototypes: buses, one-shot tones and noises, and spatial placement around the
 * listener (HRTF with headphones, plain panning with speakers, «behind» muffled). Everything is synthesized.
 */
export type Output = 'headphones' | 'speakers' | 'mono' | 'mute';

/** A point around the listener in cells/metres: x to the right, z ahead (negative = behind). */
export interface Spot {
  x: number;
  z: number;
}

export type Bus = 'sfx' | 'ui' | 'amb' | 'music';

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

const DB = (db: number) => 10 ** (db / 20);

export class Sound {
  ctx: AudioContext | null = null;
  out: Output = 'headphones';
  private master: GainNode | null = null;
  private buses = new Map<Bus, GainNode>();
  private noiseBuf: AudioBuffer | null = null;

  /** Must run inside a click or key handler: browsers start audio only after a gesture. */
  unlock(out: Output): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      const levels: Record<Bus, number> = { sfx: DB(-4), ui: DB(-8), amb: DB(-14), music: DB(-6) };
      for (const [bus, g] of Object.entries(levels) as [Bus, number][]) {
        const node = ctx.createGain();
        node.gain.value = g;
        node.connect(this.master);
        this.buses.set(bus, node);
      }
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) void ctx.suspend();
        else void ctx.resume();
      });
    }
    void this.ctx.resume();
    this.setOutput(out);
  }

  setOutput(out: Output): void {
    this.out = out;
    if (!this.ctx || !this.master) return;
    this.master.gain.value = out === 'mute' ? 0 : 1;
    const d = this.ctx.destination;
    d.channelCount = out === 'mono' ? 1 : Math.min(2, d.maxChannelCount || 2);
    d.channelInterpretation = 'speakers';
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  bus(name: Bus): GainNode | null {
    return this.buses.get(name) ?? null;
  }

  /** Where a one-shot plugs in: a bus, or a panner at a spot around the listener. */
  dest(spot?: Spot, bus: Bus = 'sfx'): AudioNode | null {
    const ctx = this.ctx;
    const target = this.buses.get(bus);
    if (!ctx || !target) return null;
    if (!spot) return target;
    const p = ctx.createPanner();
    p.panningModel = this.out === 'headphones' ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 1;
    p.rolloffFactor = 0.8;
    // The listener faces -Z, so «ahead» is negative z in Web Audio.
    p.positionX.value = spot.x;
    p.positionY.value = 0;
    p.positionZ.value = -spot.z;
    if (this.out !== 'headphones' && spot.z < -0.2) {
      // Speakers can't place a sound behind you: muffle it instead, and the screen says «сзади».
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;
      lp.connect(p);
      p.connect(target);
      return lp;
    }
    p.connect(target);
    return p;
  }

  tone(o: ToneOpts): void {
    const ctx = this.ctx;
    const dest = this.dest(o.spot, o.bus);
    if (!ctx || !dest) return;
    const t = o.at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + o.dur);
    const g = ctx.createGain();
    const a = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.3, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  noise(o: NoiseOpts): void {
    const ctx = this.ctx;
    const dest = this.dest(o.spot, o.bus);
    if (!ctx || !dest || !this.noiseBuf) return;
    const t = o.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 1200, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur);
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    const a = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.3, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + o.dur + 0.05);
  }
}

/** A small library of sounds both battle prototypes and the brawl need. `v` varies each call so repeats don't machine-gun. */
export function sfx(s: Sound) {
  const v = (k = 0.08) => 1 + (Math.random() * 2 - 1) * k;
  return {
    /** The relay of the red lamp: the beacon from the coordinators' zone. */
    click(spot?: Spot) {
      s.noise({ dur: 0.03, filter: 'highpass', freq: 2500, gain: 0.35, spot });
      s.tone({ freq: 1900 * v(), dur: 0.04, gain: 0.08, type: 'square', spot });
    },
    step(spot?: Spot, gain = 0.32) {
      s.noise({ dur: 0.09, freq: 320 * v(), gain, spot });
      s.noise({ dur: 0.05, filter: 'bandpass', freq: 2200 * v(), q: 1.2, gain: gain * 0.35, spot, at: s.now + 0.01 });
    },
    /** Paper crushed underfoot: a creature dies. Wet and long. */
    crunch(spot?: Spot) {
      for (let i = 0; i < 7; i++) s.noise({ dur: 0.05 + Math.random() * 0.05, filter: 'bandpass', freq: 900 + Math.random() * 2600, q: 2, gain: 0.32, spot, at: s.now + i * 0.035 + Math.random() * 0.02 });
      s.noise({ dur: 0.35, freq: 260, gain: 0.25, spot });
    },
    /** Dry paper crackle and a small chime: a secret, a folded letter someone dropped. */
    paper(spot?: Spot) {
      for (let i = 0; i < 4; i++) s.noise({ dur: 0.03, filter: 'highpass', freq: 3500 + Math.random() * 2500, gain: 0.18, spot, at: s.now + i * 0.03 });
      s.tone({ freq: 2640, dur: 0.5, gain: 0.05, spot, at: s.now + 0.12 });
    },
    glint(spot?: Spot) {
      s.tone({ freq: 2640 * v(0.03), dur: 0.35, gain: 0.04, spot });
      s.tone({ freq: 3960 * v(0.03), dur: 0.25, gain: 0.025, spot, at: s.now + 0.05 });
    },
    /** A creature crawling: dry scraping paper. */
    rustle(spot?: Spot, dur = 0.6, gain = 0.2) {
      for (let i = 0; i < Math.round(dur * 10); i++) s.noise({ dur: 0.08, filter: 'bandpass', freq: 2600 * v(0.3), q: 3, gain: gain * (0.5 + Math.random() * 0.5), spot, at: s.now + i * 0.1 * v(0.3) });
    },
    thud(spot?: Spot) {
      s.tone({ freq: 90 * v(), to: 45, dur: 0.25, gain: 0.5, spot });
      s.noise({ dur: 0.12, freq: 500, gain: 0.3, spot });
    },
    /** Floor gives way: a pit. */
    sag(spot?: Spot) {
      s.tone({ freq: 140, to: 60, type: 'sawtooth', dur: 0.5, gain: 0.12, spot });
      s.noise({ dur: 0.45, freq: 400, to: 120, gain: 0.3, spot });
    },
    /** A mine: a dull pop under the floor. */
    pop(spot?: Spot) {
      s.noise({ dur: 0.4, freq: 900, to: 90, gain: 0.6, spot });
      s.tone({ freq: 70, to: 35, dur: 0.4, gain: 0.5, spot });
    },
    /** A snare: a wire twang. */
    twang(spot?: Spot) {
      s.tone({ freq: 330, to: 310, type: 'triangle', dur: 0.6, gain: 0.15, spot });
      s.tone({ freq: 990, to: 930, dur: 0.3, gain: 0.05, spot });
    },
    /** «Ай!» without a voice: a short vocal blip through two formants. */
    cry(spot?: Spot, pitch = 1) {
      const ctx = s.ctx;
      const dest = s.dest(spot);
      if (!ctx || !dest) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320 * pitch * v(0.05), t);
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
    },
    // Coordinators' signals (concept: whistle, finger snap, cough, knock on a pipe).
    whistle(spot?: Spot) {
      s.tone({ freq: 1750, to: 2250, dur: 0.18, gain: 0.12, spot });
      s.tone({ freq: 2250, to: 1900, dur: 0.22, gain: 0.12, spot, at: s.now + 0.2 });
    },
    snap(spot?: Spot) {
      s.noise({ dur: 0.025, filter: 'highpass', freq: 3000, gain: 0.5, spot });
      s.noise({ dur: 0.025, filter: 'highpass', freq: 3000, gain: 0.5, spot, at: s.now + 0.14 });
    },
    cough(spot?: Spot) {
      s.noise({ dur: 0.14, filter: 'bandpass', freq: 650, q: 2, gain: 0.45, spot });
      s.noise({ dur: 0.12, filter: 'bandpass', freq: 560, q: 2, gain: 0.35, spot, at: s.now + 0.2 });
    },
    pipe(spot?: Spot) {
      for (const at of [0, 0.16]) {
        s.tone({ freq: 523, dur: 0.5, gain: 0.12, spot, at: s.now + at });
        s.tone({ freq: 1390, dur: 0.25, gain: 0.05, spot, at: s.now + at });
      }
    },
    drip(spot?: Spot) {
      s.tone({ freq: 1400 * v(0.2), to: 700, dur: 0.12, gain: 0.05, spot, bus: 'amb' });
    },
    /** One heartbeat (lub-dub). */
    heart(gain = 0.5) {
      s.tone({ freq: 58, to: 40, dur: 0.16, gain, bus: 'ui' });
      s.tone({ freq: 52, to: 38, dur: 0.14, gain: gain * 0.7, bus: 'ui', at: s.now + 0.2 });
    },
    whoosh(spot?: Spot) {
      s.noise({ dur: 0.16, filter: 'bandpass', freq: 600, to: 2400, q: 1.5, gain: 0.25, spot });
    },
    shot(spot?: Spot) {
      s.noise({ dur: 0.08, filter: 'highpass', freq: 1200, gain: 0.9, spot });
      s.noise({ dur: 0.6, freq: 1800, to: 120, gain: 0.7, spot });
      s.tone({ freq: 60, to: 30, dur: 0.4, gain: 0.7, spot });
    },
    splat(spot?: Spot) {
      s.noise({ dur: 0.18, freq: 700, to: 200, q: 3, gain: 0.45, spot });
    },
    uiTick() {
      s.tone({ freq: 880, dur: 0.05, gain: 0.08, type: 'triangle', bus: 'ui' });
    },
  };
}

export type Sfx = ReturnType<typeof sfx>;
