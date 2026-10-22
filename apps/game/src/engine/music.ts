/**
 * The game's music (concept «Музыка»): an event, never a background. A track is rendered once with an
 * OfflineAudioContext (engine/music/render.ts), cached, and played into the music bus like a cassette: it ends
 * on its own, the tape clicks, and a looping track starts again after a pause (one with loop points, the
 * mutiny's, goes round without a seam). Under dialogue and letters it
 * ducks by 12 dB; stopping fades it out on a bar line, or cuts it with the tape recorder's «стоп» click.
 */
import { TRACKS, type TrackId } from '../content/tracks.ts';
import type { AudioEngine } from './audio.ts';
import { renderTrack, type Rendered, type Synth } from './music/render.ts';

export type { TrackId };

/** Seconds of quiet between the end of a looping track and its start again (a cassette's gap). */
const GAP = 2.5;
const DUCK_DB = -12;

interface Playing {
  id: TrackId;
  rendered: Rendered;
  src: AudioBufferSourceNode;
  gain: GainNode;
  /** Context time of the track's 0 s. */
  t0: number;
  loop: boolean;
  wear: number;
  stopped: boolean;
}

export class Music {
  private readonly audio: AudioEngine;
  private readonly cache = new Map<string, Promise<Rendered>>();
  private current: Playing | null = null;
  private duckGain: GainNode | null = null;
  private ducked = false;
  /** Bumped by every play/stop, so a late restart of a looping track can tell it was superseded. */
  private token = 0;

  constructor(audio: AudioEngine) {
    this.audio = audio;
  }

  get playing(): TrackId | null {
    return this.current?.id ?? null;
  }

  /** Prepares a track's buffer in advance (a quiet moment, before the scene that needs it). */
  async prerender(id: TrackId): Promise<void> {
    await this.render(id, 0);
  }

  /** Renders (once, cached) and starts a track; resolves when it has started. */
  async play(id: TrackId, opts: { wear?: number; loop?: boolean } = {}): Promise<void> {
    const token = ++this.token;
    const wear = opts.wear ?? 0;
    const rendered = await this.render(id, wear);
    if (token !== this.token) return;
    if (this.current) await this.fade(0.6);
    if (token !== this.token) return;
    this.start(id, rendered, !!opts.loop, wear, token);
  }

  /** Fades out over 2–3 s from the next bar line; with `click`, the tape recorder's «стоп»: a click and the tape running down. */
  async stop(opts: { click?: boolean } = {}): Promise<void> {
    this.token++;
    const cur = this.current;
    const ctx = this.audio.context;
    if (!cur || !ctx) {
      this.current = null;
      return;
    }
    if (opts.click) {
      cur.stopped = true;
      const t = ctx.currentTime;
      this.clunk(t);
      cur.src.playbackRate.setValueAtTime(1, t);
      cur.src.playbackRate.linearRampToValueAtTime(0.55, t + 0.16);
      cur.gain.gain.setTargetAtTime(0, t + 0.02, 0.04);
      cur.src.stop(t + 0.25);
      this.current = null;
      await wait(250);
      return;
    }
    // Wait for the bar line if it is close, so the fade starts on the music's own beat.
    const { bar, start } = cur.rendered.score;
    const pos = ctx.currentTime - cur.t0;
    const into = pos - start;
    let at = ctx.currentTime;
    if (into > 0) {
      const toBar = bar - (into % bar);
      if (toBar < 1.2) at += toBar;
    }
    await this.fade(2.5, at);
  }

  /** −12 dB under speech and letters, back to full when false. */
  duck(on: boolean): void {
    this.ducked = on;
    const g = this.duckGain;
    const ctx = this.audio.context;
    if (!g || !ctx) return;
    g.gain.cancelScheduledValues(ctx.currentTime);
    g.gain.setTargetAtTime(on ? 10 ** (DUCK_DB / 20) : 1, ctx.currentTime, on ? 0.08 : 0.25);
  }

  private synthWorker: Worker | null | undefined;
  private readonly waiting = new Map<string, (s: Synth) => void>();

  /** The worker that synthesizes tracks off the page; null where workers can't start (then the page does it). */
  private worker(): Worker | null {
    if (this.synthWorker !== undefined) return this.synthWorker;
    try {
      const w = new Worker(new URL('./music/worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: TrackId; sr: number } & Synth>) => {
        const key = `${e.data.id}@${e.data.sr}`;
        this.waiting.get(key)?.({ left: e.data.left, right: e.data.right });
        this.waiting.delete(key);
      };
      this.synthWorker = w;
    } catch {
      this.synthWorker = null;
    }
    return this.synthWorker;
  }

  private readonly synths = new Map<string, Promise<Synth>>();

  /** Wear only changes the master, so one synthesis per track serves every wear. */
  private synthOff(id: TrackId, sr: number): Promise<Synth> {
    const key = `${id}@${sr}`;
    let job = this.synths.get(key);
    if (!job) {
      job = new Promise((resolve) => {
        this.waiting.set(key, resolve);
        this.worker()?.postMessage({ id, sr });
      });
      this.synths.set(key, job);
    }
    return job;
  }

  private render(id: TrackId, wear: number): Promise<Rendered> {
    const w = Math.round(Math.max(0, Math.min(1, wear)) * 10) / 10;
    const key = `${id}:${w}`;
    let job = this.cache.get(key);
    if (!job) {
      const sampleRate = this.audio.context?.sampleRate ?? 44100;
      job = renderTrack(TRACKS[id], { wear: w, sampleRate, ...(this.worker() ? { synth: (def, sr) => this.synthOff(def.id as TrackId, sr) } : {}) });
      this.cache.set(key, job);
      job.catch(() => this.cache.delete(key));
    }
    return job;
  }

  private start(id: TrackId, rendered: Rendered, loop: boolean, wear: number, token: number): void {
    const ctx = this.audio.context;
    const bus = this.audio.bus('music');
    if (!ctx || !bus) return;
    if (!this.duckGain) {
      this.duckGain = ctx.createGain();
      this.duckGain.connect(bus);
    }
    this.duckGain.gain.value = this.ducked ? 10 ** (DUCK_DB / 20) : 1;
    const src = ctx.createBufferSource();
    src.buffer = rendered.buffer;
    // A track with loop points (the mutiny's) goes round without the cassette's click and gap.
    if (loop && rendered.loop) {
      src.loop = true;
      src.loopStart = rendered.loop.start;
      src.loopEnd = rendered.loop.end;
    }
    const gain = ctx.createGain();
    src.connect(gain).connect(this.duckGain);
    const t0 = ctx.currentTime + 0.05;
    src.start(t0);
    const playing: Playing = { id, rendered, src, gain, t0, loop, wear, stopped: false };
    this.current = playing;
    src.onended = () => {
      if (playing.stopped || this.current !== playing) return;
      // The end of the tape side: a click, a gap, and round again if it loops.
      this.clunk(ctx.currentTime, 0.4);
      if (!loop) {
        this.current = null;
        return;
      }
      setTimeout(() => {
        if (this.token === token && this.current === playing) this.start(id, rendered, loop, wear, token);
      }, GAP * 1000);
    };
  }

  /** Fades the current track to silence over `seconds` from `at` and stops it. */
  private fade(seconds: number, at?: number): Promise<void> {
    const cur = this.current;
    const ctx = this.audio.context;
    this.current = null;
    if (!cur || !ctx) return Promise.resolve();
    cur.stopped = true;
    const from = at ?? ctx.currentTime;
    cur.gain.gain.setValueAtTime(cur.gain.gain.value, from);
    cur.gain.gain.linearRampToValueAtTime(0, from + seconds);
    cur.src.stop(from + seconds + 0.05);
    return wait((from - ctx.currentTime + seconds) * 1000);
  }

  /** The tape recorder's mechanism: a key going down, a short thunk. */
  private clunk(t: number, level = 1): void {
    const ctx = this.audio.context;
    const noise = this.audio.noiseBuffer;
    const out = this.audio.bus('sfx');
    if (!ctx || !noise || !out) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * level, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(hp).connect(g).connect(out);
    src.start(t, 0.1, 0.06);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.3 * level, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.12);
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));
