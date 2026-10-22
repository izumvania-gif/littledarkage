import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRng } from '../src/core/rng.ts';
import { SPEECH_FRAGMENTS, type SpeechFragment } from '../src/content/speechFragments.ts';
import { deal, MAX_LINES, SLIPS, SpeechDraft, speechKind } from '../src/stages/speech/speechModel.ts';

const of = (...kinds: SpeechFragment['kind'][]) => kinds.map((kind) => ({ kind }));

test('every fragment fits a slip, has a unique id, and silence is written as a stage direction', () => {
  const ids = new Set(SPEECH_FRAGMENTS.map((f) => f.id));
  assert.equal(ids.size, SPEECH_FRAGMENTS.length);
  for (const f of SPEECH_FRAGMENTS) {
    assert.ok(f.text.length <= 64, `${f.id} is too long for a slip`);
    assert.ok(f.id.startsWith(`${f.kind}_`), `${f.id} should start with its kind`);
    if (f.kind === 'silence') assert.match(f.text, /^\(.+\)$/);
    else assert.doesNotMatch(f.text, /^\(/);
  }
  for (const kind of ['hollow', 'truth', 'order', 'silence'] as const) assert.ok(SPEECH_FRAGMENTS.some((f) => f.kind === kind), `no ${kind}`);
});

test('a speech is what it mostly was; no majority is mixed; nothing said is silence', () => {
  assert.equal(speechKind([]), 'silence');
  assert.equal(speechKind(of('truth')), 'truth');
  assert.equal(speechKind(of('order', 'order', 'truth')), 'order');
  assert.equal(speechKind(of('hollow', 'hollow', 'truth', 'order')), 'mixed');
  assert.equal(speechKind(of('hollow', 'hollow', 'hollow', 'order')), 'hollow');
  assert.equal(speechKind(of('truth', 'order')), 'mixed');
  assert.equal(speechKind(of('silence', 'silence', 'truth')), 'silence');
});

test('the desk deals nine slips of every kind, without repeats', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const slips = deal(SPEECH_FRAGMENTS, seededRng(seed));
    assert.equal(slips.length, SLIPS);
    assert.equal(new Set(slips).size, SLIPS);
    const count = (k: string) => slips.filter((s) => s.kind === k).length;
    assert.equal(count('hollow'), 3);
    assert.equal(count('truth'), 3);
    assert.equal(count('order'), 2);
    assert.equal(count('silence'), 1);
  }
});

test('a short list deals what it has, and a missing kind gives its place to others', () => {
  const few = SPEECH_FRAGMENTS.filter((f) => f.kind === 'order');
  assert.equal(deal(few, seededRng(1)).length, few.length);
  const noSilence = SPEECH_FRAGMENTS.filter((f) => f.kind !== 'silence');
  const slips = deal(noSilence, seededRng(2));
  assert.equal(slips.length, SLIPS);
  assert.equal(new Set(slips).size, SLIPS);
});

test('a draft takes slips in order, at most four, and gives the last one back', () => {
  const slips = deal(SPEECH_FRAGMENTS, seededRng(7));
  const d = new SpeechDraft(slips);
  assert.ok(d.pick(2));
  assert.ok(!d.pick(2), 'the same slip twice');
  assert.ok(d.taken(2));
  for (const i of [0, 1, 3]) assert.ok(d.pick(i));
  assert.equal(d.lines.length, MAX_LINES);
  assert.ok(d.full);
  assert.ok(!d.pick(4), 'a full speech takes no more');
  assert.equal(d.unpick(), slips[3]);
  assert.ok(!d.taken(3));
  const r = d.result();
  assert.deepEqual(r.lines, [slips[2]!.text, slips[0]!.text, slips[1]!.text]);
  assert.equal(r.kind, speechKind([slips[2]!, slips[0]!, slips[1]!]));
});
