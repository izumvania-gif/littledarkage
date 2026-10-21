/**
 * The tape recorder at full volume: a fast, angry guitar instrumental, synthesized. Power chords from
 * detuned saws through a WaveShaper, a bass, kick, snare and hats, scheduled a little ahead of the audio
 * clock. One pass is about two minutes, then it loops.
 */
const BPM = 172;
const SIXTEENTH = 60 / BPM / 4;

const E = 82.41;
const G = 98.0;
const A = 110.0;
const B = 123.47;
const C = 130.81;
const D = 146.83;
const F = 87.31;

/** One bar: a chord root per beat, the guitar rhythm (x chug, X open accent, - rest) and the drums (k kick, s snare, h hat). */
interface Bar {
  roots: [number, number, number, number];
  gtr: string;
  drums: string;
}

const RIFF_A: Bar[] = [
  { roots: [E, E, E, E], gtr: 'xxXxxxXxxxXx-xXx', drums: 'k-h-s-h-k-k-s-h-' },
  { roots: [E, E, G, A], gtr: 'xxXxxxXxX-X-X-X-', drums: 'k-h-s-h-k-k-s-hs' },
];
const RIFF_B: Bar[] = [
  { roots: [C, C, B, B], gtr: 'X--xX--xX--xX-xx', drums: 'k-h-s-h-k-h-s-h-' },
  { roots: [A, A, G, F], gtr: 'X--xX--xX--xXxXx', drums: 'k-h-s-h-k-h-s-ss' },
];
const RIFF_C: Bar[] = [
  { roots: [E, D, E, G], gtr: 'xXxXxXxXxXxXxXxX', drums: 'kshskshskshskshs' },
  { roots: [A, G, D, E], gtr: 'xXxXxXxXX-X-X-X-', drums: 'kshskshskshsssss' },
];
const BREAK: Bar[] = [{ roots: [E, E, E, E], gtr: 'X---------------', drums: 'k-------k-------' }];
const INTRO: Bar[] = [{ roots: [E, E, E, E], gtr: 'xxxxxxxxxxxxxxxx', drums: '----------------' }];

const rep = (bars: Bar[], n: number) => Array.from({ length: n }, () => bars).flat();
const SONG: Bar[] = [
  ...rep(INTRO, 2),
  ...rep(RIFF_A, 4),
  ...rep(RIFF_B, 4),
  ...rep(RIFF_A, 4),
  ...rep(RIFF_C, 4),
  ...rep(BREAK, 2),
  ...rep(RIFF_A, 4),
  ...rep(RIFF_B, 4),
  ...rep(RIFF_C, 4),
  ...rep(RIFF_A, 4),
  ...rep(RIFF_B, 4),
  ...rep(RIFF_C, 4),
  ...rep(RIFF_A, 4),
];

function distortion(ctx: AudioContext, k: number): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  ws.curve = curve;
  ws.oversample = '2x';
  return ws;
}

export class TapeMusic {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly gtr: GainNode;
  private readonly noise: AudioBuffer;
  private timer = 0;
  private next = 0;
  private step = 0;
  playing = false;

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    // Guitar chain: drive → cabinet-ish lowpass with a mid bump.
    this.gtr = ctx.createGain();
    this.gtr.gain.value = 0.5;
    const drive = distortion(ctx, 60);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3600;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1400;
    mid.gain.value = 5;
    this.gtr.connect(drive).connect(lp).connect(mid).connect(this.out);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(0.0001, t);
    this.out.gain.exponentialRampToValueAtTime(0.85, t + 0.15);
    this.next = t + 0.08;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    window.clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  }

  private schedule(): void {
    while (this.next < this.ctx.currentTime + 0.15) {
      const bar = SONG[Math.floor(this.step / 16) % SONG.length]!;
      const i = this.step % 16;
      const root = bar.roots[Math.floor(i / 4)]!;
      const g = bar.gtr[i];
      if (g === 'x') this.chord(root, this.next, 0.09, 0.32, false);
      else if (g === 'X') this.chord(root, this.next, SIXTEENTH * 3.2, 0.42, true);
      if (g === 'x' || g === 'X') this.bass(root / 2, this.next, g === 'X' ? SIXTEENTH * 2 : 0.1);
      const dr = bar.drums[i];
      if (dr === 'k') this.kick(this.next);
      else if (dr === 's') this.snare(this.next);
      if (dr === 'h' || i % 2 === 0) this.hat(this.next, dr === 'h' ? 0.09 : 0.05);
      this.next += SIXTEENTH;
      this.step++;
    }
  }

  private chord(root: number, t: number, dur: number, gain: number, open: boolean): void {
    const ctx = this.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    env.gain.exponentialRampToValueAtTime(gain * 0.5, t + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    env.connect(this.gtr);
    const notes = open ? [root, root * 1.5, root * 2] : [root, root * 1.5];
    for (const f of notes) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(env);
        o.start(t);
        o.stop(t + dur + 0.02);
      }
    }
  }

  private bass(f: number, t: number, dur: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(t: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.75, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.22);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private snare(t: number): void {
    this.noiseHit(t, 'highpass', 1500, 0.16, 0.45);
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.12);
  }

  private hat(t: number, gain: number): void {
    this.noiseHit(t, 'highpass', 7000, 0.04, gain);
  }
}
