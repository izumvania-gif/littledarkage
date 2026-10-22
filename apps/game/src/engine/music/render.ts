/**
 * Renders a score once. Each part is synthesized note by note in JavaScript (voices.ts) into its own buffer and
 * put through its small chain there (the acoustic's wooden body, the electric's overdrive and cabinet, the
 * harmonica's mouth); the parts are panned into a dry mix and a reverb send, and the room is added in
 * JavaScript too. Only the master runs in an OfflineAudioContext, a handful of nodes: a bus compressor and the
 * cassette (saturation, dull highs, wow and flutter, hiss). The result is normalized and measured.
 */
import { biquad, drum, freeverb, levels, pluck, type Kit } from './dsp.ts';
import type { DrumHit } from './patterns.ts';
import { buildScore, type Note, type Part, type Score, type ScoreEvent, type TrackDef } from './score.ts';
import { hz } from './theory.ts';
import { addHarmonica, addPad, addPluck, addShot, addSlap, addSynthBass, addSynthLead } from './voices.ts';

export interface Rendered {
  buffer: AudioBuffer;
  score: Score;
  /** Seconds the render took, and how much of it went to the parts (the rest is the master graph). */
  renderSeconds: number;
  scheduleSeconds: number;
  peakDb: number;
  rmsDb: number;
  sections: { name: string; t: number; rmsDb: number }[];
  /** For a looping track: where to go back to and from, seconds on whole samples of the buffer (AudioBufferSourceNode.loopStart/loopEnd). */
  loop?: { start: number; end: number };
}

const DB = (db: number) => 10 ** (db / 20);

/** Target loudness after rendering, and the ceiling no peak may cross (the music leaves headroom under the effects). */
const TARGET_RMS_DB = -19;
const CEILING_DB = -3;
/** The last moments before a loop's end are blended into those before its start, so the jump back has no click. */
const SEAM_SECONDS = 0.04;

type PluckKind = 'acoustic' | 'electric' | 'bass' | 'muted' | 'emuted';

/** How each plucked sound rings. */
const PLUCK: Record<PluckKind, { brightness: number; t60: number; seconds: number; pick: number }> = {
  acoustic: { brightness: 0.82, t60: 3.2, seconds: 3.2, pick: 0.13 },
  electric: { brightness: 0.62, t60: 3.6, seconds: 3.2, pick: 0.2 },
  bass: { brightness: 0.28, t60: 3.0, seconds: 2.8, pick: 0.22 },
  muted: { brightness: 0.25, t60: 0.12, seconds: 0.25, pick: 0.13 },
  emuted: { brightness: 0.38, t60: 0.16, seconds: 0.3, pick: 0.2 },
};

const HIT_PAN: Partial<Record<DrumHit, number>> = { hatC: 0.28, hatO: 0.28, shaker: 0.35, crash: -0.22, rim: 0.1, clap: -0.05, sticks: 0.15 };
const HIT_GAIN: Partial<Record<DrumHit, number>> = { crash: 0.55, hatC: 0.5, shaker: 0.5 };

/** Where each part sits and how much of it goes to the room. */
const PLACE: Record<Part, { pan: number; wet: number }> = {
  acoustic: { pan: -0.18, wet: 0.16 },
  electric: { pan: 0.3, wet: 0.2 },
  bass: { pan: 0, wet: 0.04 },
  drums: { pan: 0, wet: 0.12 },
  harmonica: { pan: 0.12, wet: 0.3 },
  synthLead: { pan: -0.08, wet: 0.28 },
  synthBass: { pan: 0, wet: 0.03 },
  pad: { pan: 0, wet: 0.4 },
};

/** Equal-power pan gains, unity in the middle. */
function panGains(pan: number): [number, number] {
  const a = ((pan + 1) * Math.PI) / 4;
  return [Math.cos(a) * Math.SQRT2, Math.sin(a) * Math.SQRT2];
}

function chain(x: Float32Array, fs: readonly ((v: number) => number)[]): void {
  if (!fs.length) return;
  for (let i = 0; i < x.length; i++) {
    let v = x[i]!;
    for (const f of fs) v = f(v);
    x[i] = v;
  }
}

/** Each part's own colour, applied to its whole buffer. */
function partChain(part: Part, sr: number, drive = 3.2): ((x: number) => number)[] {
  switch (part) {
    case 'acoustic':
      // A wooden body: low resonances and a little air on top.
      return [biquad('highpass', 75, 0.7, sr), biquad('peaking', 105, 1.6, sr, 4), biquad('peaking', 230, 1.2, sr, 2), biquad('peaking', 3200, 0.8, sr, 2)];
    case 'electric': {
      // Light overdrive into a small cabinet.
      const norm = Math.tanh(drive);
      return [(x) => Math.tanh(drive * x) / norm, biquad('highpass', 95, 0.7, sr), biquad('peaking', 1300, 1, sr, 3), biquad('lowpass', 4300, 0.9, sr)];
    }
    case 'bass':
      return [biquad('lowpass', 1100, 0.7, sr), biquad('peaking', 85, 1, sr, 2)];
    case 'harmonica':
      // The mouth around the reeds.
      return [biquad('highpass', 260, 0.7, sr), biquad('lowpass', 2900, 0.6, sr), biquad('peaking', 1450, 1.4, sr, 7)];
    case 'pad':
      return [biquad('lowpass', 1500, 0.5, sr)];
    default:
      return [];
  }
}

/** Plain left and right channels of the dry mix (the parts and the room), before the master. */
export interface Synth {
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer>;
}

/**
 * The parts and the room, in plain JavaScript with no Web Audio: seconds of number crunching, so the game runs it
 * in a worker (music/worker.ts) and only the short master graph on the page.
 */
export function synthesize(def: TrackDef, sr: number): Synth {
  const score = buildScore(def);
  const length = Math.ceil(score.duration * sr);
  // The dry mix and, beside it, the reverb send.
  const dryL = new Float32Array(length);
  const dryR = new Float32Array(length);
  const wetL = new Float32Array(length);
  const wetR = new Float32Array(length);

  const mixMono = (x: Float32Array, level: number, pan: number, send: number) => {
    const [gl, gr] = panGains(pan);
    for (let i = 0; i < x.length; i++) {
      const v = x[i]! * level;
      if (v === 0) continue;
      dryL[i]! += v * gl;
      dryR[i]! += v * gr;
      wetL[i]! += v * gl * send;
      wetR[i]! += v * gr * send;
    }
  };
  const mixStereo = (l: Float32Array, r: Float32Array, level: number, send: number) => {
    for (let i = 0; i < l.length; i++) {
      const a = l[i]! * level;
      const b = r[i]! * level;
      dryL[i]! += a;
      dryR[i]! += b;
      wetL[i]! += a * send;
      wetR[i]! += b * send;
    }
  };

  const byPart = new Map<Part, ScoreEvent[]>();
  for (const ev of score.events) {
    const p: Part = ev.kind === 'hit' ? 'drums' : ev.part;
    const list = byPart.get(p) ?? [];
    list.push(ev);
    byPart.set(p, list);
  }

  const pluckCache = new Map<string, Float32Array>();
  const pluckSample = (kind: PluckKind, m: number, variant: number): Float32Array => {
    const key = `${kind}:${m}:${variant}`;
    let s = pluckCache.get(key);
    if (!s) {
      const o = PLUCK[kind];
      // Lower strings ring longer.
      const t60 = kind === 'muted' || kind === 'emuted' ? o.t60 : Math.max(0.3, o.t60 * (1.4 - (m - 40) / 60));
      s = pluck(sr, hz(m), { ...o, t60, seed: def.seed + m * 31 + variant * 7 });
      pluckCache.set(key, s);
    }
    return s;
  };
  const kit: Kit = def.id === 'disco' ? 'machine' : 'band';
  const drumCache = new Map<string, Float32Array>();
  const drumSample = (h: DrumHit, variant: number): Float32Array => {
    const key = `${h}:${variant}`;
    let s = drumCache.get(key);
    if (!s) {
      s = drum(h, kit, sr, variant + 1);
      drumCache.set(key, s);
    }
    return s;
  };

  for (const [part, events] of byPart) {
    const { pan, wet: send } = PLACE[part];
    const level = DB(def.mix[part] ?? -10);
    if (part === 'drums') {
      // Each hit carries its own place in the stereo; an open hi-hat is choked by the next closed one.
      const left = new Float32Array(length);
      const right = new Float32Array(length);
      const closed = events.filter((e) => e.kind === 'hit' && e.hit === 'hatC').map((e) => e.t);
      let variant = 0;
      for (const ev of events) {
        if (ev.kind !== 'hit') continue;
        const sample = drumSample(ev.hit, variant++ % 3);
        const choke = ev.hit === 'hatO' ? (closed.find((t) => t > ev.t) ?? Infinity) : Infinity;
        const [gl, gr] = panGains(HIT_PAN[ev.hit] ?? 0);
        const g = ev.vel * (HIT_GAIN[ev.hit] ?? 1);
        addShot(left, sr, sample, ev.t, g * gl, choke);
        addShot(right, sr, sample, ev.t, g * gr, choke);
      }
      mixStereo(left, right, level, send);
      continue;
    }
    if (part === 'pad') {
      const left = new Float32Array(length);
      const right = new Float32Array(length);
      for (const ev of events) if (ev.kind === 'note') addPad(left, right, sr, ev);
      chain(left, partChain(part, sr));
      chain(right, partChain(part, sr));
      mixStereo(left, right, level, send);
      continue;
    }
    const mono = new Float32Array(length);
    // A string (or a monophonic line) stops when it sounds again: find each note's successor first.
    const cutAt = new Map<Note, number>();
    const lastOn = new Map<string, Note>();
    for (const ev of events) {
      if (ev.kind !== 'note') continue;
      const key = ev.string === undefined ? 'line' : String(ev.string);
      const prev = lastOn.get(key);
      if (prev) cutAt.set(prev, ev.t);
      lastOn.set(key, ev);
    }
    let variant = 0;
    for (const ev of events) {
      if (ev.kind !== 'note') continue;
      if (part === 'acoustic' || part === 'electric' || part === 'bass') {
        const kind: PluckKind = ev.mute ? (part === 'electric' ? 'emuted' : 'muted') : part;
        const cut = cutAt.get(ev) ?? Infinity;
        const endAt = Math.min(ev.t + ev.dur, cut);
        const release = ev.mute ? 0.01 : cut <= ev.t + ev.dur ? 0.008 : 0.04;
        const bend = ev.cents !== undefined ? { cents: ev.cents, centsTo: ev.centsTo ?? 0, bendTime: ev.bendTime ?? 0.1 } : undefined;
        addPluck(mono, sr, pluckSample(kind, ev.midi, variant++ % 2), ev.t, ev.vel, endAt, release, bend);
        if (ev.slap) addSlap(mono, sr, ev.t, ev.vel, Math.floor(ev.t * 1000));
      } else if (part === 'harmonica') addHarmonica(mono, sr, ev, def.seed + Math.floor(ev.t * 1000));
      else if (part === 'synthLead') addSynthLead(mono, sr, ev);
      else if (part === 'synthBass') addSynthBass(mono, sr, ev);
    }
    chain(mono, partChain(part, sr, def.drive));
    mixMono(mono, level, pan, send);
  }

  // ---------- the room, then the master: glue and cassette ----------
  const [roomL, roomR] = freeverb(wetL, wetR, sr, 0.45 + def.room * 0.35, 0.35);
  const ret = 0.35 + def.room * 0.4;
  for (let i = 0; i < length; i++) {
    dryL[i]! += roomL[i]! * ret;
    dryR[i]! += roomR[i]! * ret;
  }
  return { left: dryL, right: dryR };
}

export async function renderTrack(def: TrackDef, opts: { wear?: number; sampleRate?: number; synth?: (def: TrackDef, sr: number) => Promise<Synth> } = {}): Promise<Rendered> {
  const started = performance.now();
  const sr = opts.sampleRate ?? 44100;
  const wear = Math.max(0, Math.min(1, opts.wear ?? 0));
  const score = buildScore(def);
  const length = Math.ceil(score.duration * sr);
  const { left, right } = opts.synth ? await opts.synth(def, sr) : synthesize(def, sr);
  const ctx = new OfflineAudioContext(2, length, sr);
  const dry = ctx.createBuffer(2, length, sr);
  dry.copyToChannel(left.subarray(0, length), 0);
  dry.copyToChannel(right.subarray(0, length), 1);
  const scheduled = performance.now();
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -20;
  glue.ratio.value = 2.5;
  glue.knee.value = 12;
  glue.attack.value = 0.012;
  glue.release.value = 0.25;
  const drySrc = ctx.createBufferSource();
  drySrc.buffer = dry;
  drySrc.connect(glue);
  cassette(ctx, glue, def.tape, wear, score.duration, def.seed);
  drySrc.start(0);
  const buffer = await ctx.startRendering();

  // Normalize: aim for the target loudness, never past the ceiling.
  const chans = [buffer.getChannelData(0), buffer.getChannelData(1)];
  const before = levels(chans);
  let gainDb = TARGET_RMS_DB - before.rms;
  if (before.peak + gainDb > CEILING_DB) gainDb = CEILING_DB - before.peak;
  const k = DB(gainDb);
  for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i]! *= k;
  let loop: Rendered['loop'];
  if (score.loop) {
    const from = Math.round(score.loop.start * sr);
    const to = Math.round(score.loop.end * sr);
    seam(chans, from, to, Math.round(SEAM_SECONDS * sr));
    loop = { start: from / sr, end: to / sr };
  }
  const after = levels(chans);
  const sections = score.sections.map((s) => ({ name: s.name, t: s.t, rmsDb: levels(chans, Math.floor(s.t * sr), Math.floor((s.t + s.bars * score.bar) * sr)).rms }));
  return { buffer, score, renderSeconds: (performance.now() - started) / 1000, scheduleSeconds: (scheduled - started) / 1000, peakDb: after.peak, rmsDb: after.rms, sections, ...(loop ? { loop } : {}) };
}

/**
 * Makes the jump from sample `to` back to sample `from` continuous: the n samples before `to` fade into the n
 * before `from`, the same music a loop earlier, so the last sample played before the jump is the one that came
 * before `from` the first time round.
 */
export function seam(chans: readonly Float32Array[], from: number, to: number, n: number): void {
  for (const ch of chans) {
    for (let i = 0; i < n; i++) {
      const b = (i + 1) / n;
      ch[to - n + i] = ch[to - n + i]! * (1 - b) + ch[from - n + i]! * b;
    }
  }
}

/** A soft clipping curve: tanh with the given drive. */
function driveCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

/**
 * The cassette on the way out: soft saturation, highs cut by wear, a modulated delay for wow (slow) and
 * flutter (fast), and hiss under everything. `tape` is how much of the cassette a track carries at all.
 */
function cassette(ctx: OfflineAudioContext, input: AudioNode, tape: number, wear: number, seconds: number, seed: number): void {
  const sat = ctx.createWaveShaper();
  sat.curve = driveCurve(1.1 + 0.9 * tape);
  sat.oversample = '2x';
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 38;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 14000 - 4500 * tape - 2500 * wear;
  lp.Q.value = 0.6;
  const delay = ctx.createDelay(0.05);
  delay.delayTime.value = 0.012;
  const wow = ctx.createOscillator();
  wow.frequency.value = 0.55;
  const wowDepth = ctx.createGain();
  wowDepth.gain.value = (0.00025 + 0.0018 * wear) * tape;
  const flutter = ctx.createOscillator();
  flutter.frequency.value = 6.7;
  const flutterDepth = ctx.createGain();
  flutterDepth.gain.value = (0.00003 + 0.00009 * wear) * tape;
  wow.connect(wowDepth).connect(delay.delayTime);
  flutter.connect(flutterDepth).connect(delay.delayTime);
  input.connect(sat).connect(hp).connect(lp).connect(delay).connect(ctx.destination);
  wow.start(0);
  flutter.start(0);

  if (tape <= 0) return;
  const hissBuf = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * 2), ctx.sampleRate);
  let s = (seed * 7 + 3) >>> 0;
  for (let c = 0; c < 2; c++) {
    const d = hissBuf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      d[i] = s / 2147483648 - 1;
    }
  }
  const hiss = ctx.createBufferSource();
  hiss.buffer = hissBuf;
  hiss.loop = true;
  const hhp = ctx.createBiquadFilter();
  hhp.type = 'highpass';
  hhp.frequency.value = 2600;
  const hlp = ctx.createBiquadFilter();
  hlp.type = 'lowpass';
  hlp.frequency.value = 9000;
  const hg = ctx.createGain();
  hg.gain.value = DB(-62 + 12 * tape + 6 * wear);
  hiss.connect(hhp).connect(hlp).connect(hg).connect(ctx.destination);
  hiss.start(0);
  hiss.stop(seconds);
}
