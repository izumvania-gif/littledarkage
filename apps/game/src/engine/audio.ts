/**
 * Sound, synthesised with Web Audio (no audio files). Everything plays into buses — sfx, ambience, ui, music —
 * under one master, so the settings map to bus volumes. The context starts only after the player's first
 * click (browsers block sound before that) and pauses while the tab is hidden.
 */
import type { Output } from '../core/settings.ts';

const dbToGain = (db: number) => Math.pow(10, db / 20);

export type Bus = 'sfx' | 'ui' | 'ambience' | 'music';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ui!: GainNode;
  private ambience!: GainNode;
  /** The band and the tape recorder: about 10 dB under the sound effects (engine/music.ts). */
  private music!: GainNode;
  private white!: AudioBuffer;
  private mode: Output = 'headphones';

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** The running context, for the battle's spatial sounds (engine/spatial.ts); null before the first click. */
  get context(): AudioContext | null {
    return this.ctx?.state === 'running' ? this.ctx : null;
  }

  get output(): Output {
    return this.mode;
  }

  bus(name: Bus): AudioNode | null {
    if (!this.ctx) return null;
    return name === 'sfx' ? this.sfx : name === 'ui' ? this.ui : name === 'music' ? this.music : this.ambience;
  }

  /** White noise shared by the synthesized sounds. */
  get noiseBuffer(): AudioBuffer | null {
    return this.ctx ? this.white : null;
  }

  /** Call from a click or key handler. */
  unlock(output: Output): void {
    if (this.ctx) {
      void this.ctx.resume();
      this.setOutput(output);
      return;
    }
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = dbToGain(-4);
    this.master.connect(ctx.destination);
    const bus = (db: number) => {
      const g = ctx.createGain();
      g.gain.value = dbToGain(db);
      g.connect(this.master);
      return g;
    };
    this.sfx = bus(-3);
    this.ui = bus(-9);
    this.ambience = bus(-14);
    this.music = bus(-13);
    this.white = this.noise(1, false);
    this.setOutput(output);
    this.roomTone();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void ctx.suspend();
      else void ctx.resume();
    });
  }

  /** Mono folds everything down to one channel for one-ear or mono playback. */
  setOutput(output: Output): void {
    this.mode = output;
    if (!this.ctx) return;
    const d = this.ctx.destination;
    d.channelCountMode = 'explicit';
    d.channelCount = output === 'mono' ? 1 : Math.min(2, d.maxChannelCount || 2);
  }

  /** One key of the general's typewriter: a bright noise tick and a low thock, never twice the same. */
  typeKey(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200 + Math.random() * 1600;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    src.connect(bp).connect(g).connect(this.ui);
    src.start(t, Math.random() * 0.5, 0.05);
    this.thump(t, 150 + Math.random() * 40, 0.25, 0.045, this.ui);
  }

  /** The bell at the end of a typed line. */
  bell(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    for (const [f, a] of [[2210, 0.12], [3320, 0.05]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(a, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g).connect(this.ui);
      o.start(t);
      o.stop(t + 0.75);
    }
  }

  /** «Смирно!»: the whole line stamps its heels, not quite together. */
  stomp(count: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + 0.02;
    for (let i = 0; i < count; i++) {
      const t = t0 + i * 0.03 + Math.random() * 0.025;
      const src = ctx.createBufferSource();
      src.buffer = this.white;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260 + Math.random() * 120;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      src.connect(lp).connect(g).connect(this.sfx);
      src.start(t, Math.random() * 0.5, 0.14);
      this.thump(t, 70 + Math.random() * 20, 0.5, 0.11, this.sfx);
    }
  }

  /** The lamp switching on. */
  click(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(hp).connect(g).connect(this.sfx);
    src.start(t, 0, 0.06);
  }

  private thump(t: number, freq: number, amp: number, len: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  /** The barracks at rest: a low, endless room noise. */
  private roomTone(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(4, true);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    src.connect(lp).connect(this.ambience);
    src.start();
  }

  /** White noise, or brown noise (integrated white) for the room. */
  private noise(seconds: number, brown: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }
}
