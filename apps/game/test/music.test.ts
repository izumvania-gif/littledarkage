import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRACKS } from '../src/content/tracks.ts';
import { drum, freeverb, pluck } from '../src/engine/music/dsp.ts';
import { DRUMS } from '../src/engine/music/patterns.ts';
import { seam } from '../src/engine/music/render.ts';
import { barChords, buildScore, LOOP_OVERHANG_BARS, parsePhrase, phraseBeats, RANGES, vary, type TrackId } from '../src/engine/music/score.ts';
import { CHORD_NAMES, chord, hz, midi, scale } from '../src/engine/music/theory.ts';
import { addHarmonica, addPluck, addSynthLead } from '../src/engine/music/voices.ts';

const IDS = Object.keys(TRACKS) as TrackId[];

test('every chord shape plays its own chord: tones only, the root included', () => {
  for (const name of CHORD_NAMES) {
    const c = chord(name);
    const pcs = c.voicing.filter((m) => m >= 0).map((m) => m % 12);
    assert.ok(pcs.every((pc) => c.tones.includes(pc)), name);
    assert.ok(pcs.includes(c.root), name);
  }
  assert.equal(midi('A4'), 69);
  assert.equal(midi('C#5'), 73);
});

test('every phrase fills whole bars, and every line fills its section', () => {
  for (const id of IDS) {
    const def = TRACKS[id];
    const barBeats = def.meter[0];
    for (const [name, src] of Object.entries(def.phrases)) {
      const beats = phraseBeats(parsePhrase(src));
      assert.equal(beats % barBeats, 0, `${id}.${name} has ${beats} beats`);
    }
    for (const sec of def.sections) {
      for (const entry of sec.chords) assert.ok(barChords(entry).length >= 1, `${id} ${sec.name}: ${entry}`);
      for (const line of sec.lines ?? []) {
        const beats = line.phrases.reduce((s, p) => s + phraseBeats(parsePhrase(def.phrases[p] ?? '')), 0);
        assert.equal(beats, sec.chords.length * barBeats, `${id} ${sec.name} ${line.part}`);
      }
    }
  }
});

test('the drum grids fit their bars', () => {
  for (const [id, lines] of Object.entries(DRUMS)) {
    const lens = new Set(Object.values(lines).map((g) => g.length));
    assert.equal(lens.size, 1, id);
    assert.ok([12, 16].includes([...lens][0]!), id);
  }
});

test('the tracks are as long as the concept asks (1.5–2.5 minutes, the disco shorter; the mutiny loops)', () => {
  const want: Record<TrackId, [number, number]> = { concert: [110, 140], disco: [75, 100], tape: [100, 135], concert2: [110, 145], concert3: [95, 130], riot: [80, 110] };
  for (const id of IDS) {
    const s = buildScore(TRACKS[id]);
    assert.ok(s.duration >= want[id][0] && s.duration <= want[id][1], `${id}: ${s.duration.toFixed(1)} s`);
    const tempo = TRACKS[id].meter[1] === 8 ? TRACKS[id].bpm / 3 : TRACKS[id].bpm;
    // The mutiny is the one fast thing in the game.
    if (id !== 'riot') assert.ok(tempo >= 55 && tempo <= 120, `${id} at ${tempo} bpm`);
  }
  const r = buildScore(TRACKS.riot);
  assert.ok(r.loop, 'the mutiny loops');
  assert.ok(r.loop.end - r.loop.start >= 60 && r.loop.start < 12, `loop ${r.loop.start.toFixed(1)}–${r.loop.end.toFixed(1)}`);
});

test('a loop is whole bars on the grid, and the music past its end is its own first bars again', () => {
  const s = buildScore(TRACKS.riot);
  const { start, end } = s.loop!;
  const bars = (x: number) => (x - s.start) / s.bar;
  assert.ok(Math.abs(bars(start) - Math.round(bars(start))) < 1e-9 && Math.abs((end - start) / s.bar - Math.round((end - start) / s.bar)) < 1e-9);
  // Every event of the loop's first bars comes back exactly one loop later, and nothing new starts in the overhang.
  const len = end - start;
  const key = (e: (typeof s.events)[number], dt: number) => JSON.stringify({ ...e, t: Math.round((e.t + dt) * 1e6) });
  const head = s.events.filter((e) => e.t >= start - len && e.t < start - 0.02 && e.t >= start - LOOP_OVERHANG_BARS * s.bar - 0.02);
  const over = new Set(s.events.filter((e) => e.t >= end - LOOP_OVERHANG_BARS * s.bar - 0.02 && e.t < end - 0.02).map((e) => key(e, 0)));
  assert.ok(head.length > 20);
  for (const e of head) assert.ok(over.has(key(e, len)), `missing ${key(e, len)}`);
  assert.ok(!s.events.some((e) => e.t >= end - 0.02 && e.t < end + 0.015), 'the ending starts after the loop');
});

test('the seam lands the jump on the sample that came before the loop start', () => {
  const x = new Float32Array(1000).map((_, i) => Math.sin(i * 0.37) * (i < 500 ? 1 : 0.5));
  seam([x], 300, 800, 40);
  assert.equal(x[799], x[299]);
  assert.ok(Math.abs(x[760]! - Math.sin(760 * 0.37) * 0.5) < 0.05, 'the blend starts at the original');
});

test('a tired band slips and drags, and the same track stays the same', () => {
  const tired = buildScore(TRACKS.concert2);
  const bent = tired.events.filter((e) => e.kind === 'note' && Math.abs(e.cents ?? 0) === 100);
  assert.ok(bent.length >= 3, `${bent.length} slips`);
  // The drums fall behind the bar line (the shuffle stretches it a little): late, never by more than a few hundredths.
  const kicks = tired.events.filter((e) => e.kind === 'hit' && e.hit === 'kick' && e.t >= tired.start);
  const lateness = kicks.map((k) => (((k.t - tired.start) % tired.bar) + tired.bar) % tired.bar).filter((d) => d < tired.bar / 4);
  assert.ok(lateness.some((d) => d > 0.009) && Math.max(...lateness) <= 0.04, `lateness ${Math.min(...lateness).toFixed(3)}..${Math.max(...lateness).toFixed(3)}`);
  // Half the band is gone in the third concert: no drums, no electric.
  const quiet = buildScore(TRACKS.concert3);
  assert.ok(!quiet.events.some((e) => e.kind === 'hit' || e.part === 'electric'));
});

test('a score is the same every time, its events in order, its notes in range', () => {
  for (const id of IDS) {
    const a = buildScore(TRACKS[id]);
    assert.deepEqual(buildScore(TRACKS[id]), a);
    let last = -Infinity;
    for (const ev of a.events) {
      assert.ok(ev.t >= last && ev.t >= 0 && ev.t < a.duration, `${id} at ${ev.t}`);
      last = ev.t;
      if (ev.kind === 'note') {
        const [lo, hi] = RANGES[ev.part];
        assert.ok(ev.midi >= lo && ev.midi <= hi, `${id} ${ev.part} ${ev.midi}`);
      }
    }
  }
});

test('a phrase coming back is varied, but keeps its length and its last note', () => {
  const notes = parsePhrase(TRACKS.concert.phrases.v1!);
  let changed = 0;
  for (let seed = 1; seed <= 20; seed++) {
    let s = seed;
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    const v = vary(notes, rnd, 0.7, 4, scale('Am'), () => chord('Am'));
    assert.equal(phraseBeats(v), phraseBeats(notes));
    assert.deepEqual(v.at(-1), notes.at(-1));
    if (JSON.stringify(v) !== JSON.stringify(notes)) changed++;
  }
  assert.ok(changed >= 10, `only ${changed} of 20 varied`);
  // In a whole track, the second time through a verse differs from the first.
  const score = buildScore(TRACKS.concert);
  const harp = score.events.filter((e) => e.kind === 'note' && e.part === 'harmonica');
  assert.ok(harp.length > 50);
});

/** The strongest period of a signal by autocorrelation, refined by parabolic interpolation. */
function pitch(x: Float32Array, sr: number, lo: number, hi: number): number {
  const from = Math.floor(sr / hi);
  const to = Math.ceil(sr / lo);
  const seg = x.subarray(Math.floor(0.1 * sr), Math.floor(0.1 * sr) + 8192);
  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i + lag < seg.length; i++) s += seg[i]! * seg[i + lag]!;
    return s;
  };
  let best = from;
  let bestV = -Infinity;
  for (let lag = from; lag <= to; lag++) {
    const v = ac(lag);
    if (v > bestV) {
      bestV = v;
      best = lag;
    }
  }
  const a = ac(best - 1);
  const c = ac(best + 1);
  const shift = (a - c) / (2 * (a - 2 * bestV + c));
  return sr / (best + shift);
}

test('the plucked strings are in tune', () => {
  const sr = 44100;
  for (const m of [40, 45, 57, 64, 76]) {
    const f = hz(m);
    const x = pluck(sr, f, { brightness: 0.8, t60: 3, seconds: 0.5, pick: 0.13, seed: m });
    const got = pitch(x, sr, f * 0.8, f * 1.25);
    const cents = 1200 * Math.log2(got / f);
    assert.ok(Math.abs(cents) < 8, `MIDI ${m}: ${cents.toFixed(1)} cents off`);
  }
});

test('the drums are finite and not clipping', () => {
  for (const hit of ['kick', 'snare', 'hatC', 'hatO', 'clap', 'rim', 'shaker', 'crash', 'sticks'] as const) {
    for (const kit of ['band', 'machine'] as const) {
      const x = drum(hit, kit, 44100, 1);
      let peak = 0;
      for (const v of x) {
        assert.ok(Number.isFinite(v), hit);
        peak = Math.max(peak, Math.abs(v));
      }
      assert.ok(peak > 0.05 && peak < 1.6, `${hit}/${kit} peak ${peak}`);
    }
  }
});

test('the reed and the lead play in tune, and a bent string settles on its note', () => {
  const sr = 44100;
  for (const m of [64, 72, 81]) {
    const out = new Float32Array(Math.floor(1.6 * sr));
    addHarmonica(out, sr, { t: 0, midi: m, dur: 0.8, vel: 1 }, 1);
    const cents = 1200 * Math.log2(pitch(out, sr, hz(m) * 0.8, hz(m) * 1.25) / hz(m));
    assert.ok(Math.abs(cents) < 12, `harmonica ${m}: ${cents.toFixed(1)} cents`);
    // Silent once the note has died away.
    assert.ok(out.subarray(Math.floor(1.45 * sr)).every((v) => v === 0), `harmonica ${m} still sounding`);
  }
  const lead = new Float32Array(sr);
  addSynthLead(lead, sr, { t: 0, midi: 76, dur: 0.6, vel: 1, glideFrom: 72 });
  const lc = 1200 * Math.log2(pitch(lead, sr, hz(76) * 0.8, hz(76) * 1.25) / hz(76));
  assert.ok(Math.abs(lc) < 12, `lead ${lc.toFixed(1)} cents`);
  // A string tuned up from 40 cents flat ends in tune.
  const s = pluck(sr, hz(45), { brightness: 0.8, t60: 3, seconds: 1.5, pick: 0.13, seed: 3 });
  const out = new Float32Array(Math.floor(1.5 * sr));
  addPluck(out, sr, s, 0, 1, 2, 0.04, { cents: -40, centsTo: 0, bendTime: 0.3 });
  const late = out.subarray(Math.floor(0.4 * sr));
  const bc = 1200 * Math.log2(pitch(late, sr, hz(45) * 0.8, hz(45) * 1.25) / hz(45));
  assert.ok(Math.abs(bc) < 10, `bent string ${bc.toFixed(1)} cents`);
});

test('the room rings after the sound and dies away', () => {
  const sr = 44100;
  const x = new Float32Array(3 * sr);
  x[100] = 1;
  const [l, r] = freeverb(x, x, sr, 0.6, 0.35);
  const energy = (a: Float32Array, from: number, to: number) => a.subarray(from, to).reduce((s, v) => s + v * v, 0);
  assert.ok(energy(l, 0.05 * sr, 0.5 * sr) > energy(l, 2.5 * sr, 3 * sr) * 100);
  assert.ok(l.some((v) => v !== 0) && r.some((v) => v !== 0));
});
