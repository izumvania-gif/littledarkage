import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRng } from '../src/core/rng.ts';
import { ASSEMBLY, DISASSEMBLY, PEN_LIMIT, PEN_NORM, PenModel, penScore, secondsSaid, tableSpots, type PartId } from '../src/stages/duty/pen/penModel.ts';

const kinds = (ev: { t: string }[]) => ev.map((e) => e.t);

/** Takes the pen apart in order, picking the spring up from the floor; returns the model before assembly. */
function apart(): PenModel {
  const m = new PenModel();
  for (const p of ['tip', 'refill', 'button'] as const) m.take(p);
  return m;
}

test('the parts come off from the outside in, and go back from the inside out', () => {
  assert.deepEqual([...DISASSEMBLY], ['tip', 'spring', 'refill', 'button']);
  assert.deepEqual([...ASSEMBLY].reverse(), [...DISASSEMBLY]);
});

test('unscrewing the tip lets the spring jump onto the floor', () => {
  const m = new PenModel();
  const ev = m.take('tip');
  assert.deepEqual(kinds(ev), ['off', 'drop']);
  assert.equal(m.where.spring, 'floor');
  assert.equal(m.dropped, 1);
  assert.equal(m.next(), 'refill');
});

test('a part out of turn is held by the one in the way, and counts as a mistake', () => {
  const m = new PenModel();
  assert.deepEqual(m.take('button'), [{ t: 'held', part: 'button', by: 'tip' }]);
  assert.deepEqual(m.take('refill'), [{ t: 'held', part: 'refill', by: 'tip' }]);
  assert.equal(m.mistakes, 2);
  assert.equal(m.where.button, 'pen');
});

test('the body stays in the hand: reaching for it is no mistake', () => {
  const m = new PenModel();
  assert.deepEqual(m.take('body'), [{ t: 'body' }]);
  assert.equal(m.mistakes, 0);
});

test('the pen goes together only in order, and the lost spring must be found first', () => {
  const m = apart();
  assert.equal(m.phase, 'together');
  assert.equal(m.next(), 'button');
  assert.deepEqual(m.take('tip'), [{ t: 'wrong', part: 'tip', want: 'button' }]);
  assert.deepEqual(kinds(m.take('button')), ['on']);
  assert.deepEqual(kinds(m.take('refill')), ['on']);
  // On the floor it can't go on: the first grab only picks it up.
  assert.deepEqual(kinds(m.take('spring')), ['found']);
  assert.equal(m.where.spring, 'table');
  assert.deepEqual(kinds(m.take('spring')), ['on']);
  assert.deepEqual(kinds(m.take('tip')), ['on', 'phase']);
  assert.equal(m.phase, 'check');
  assert.equal(m.mistakes, 1);
});

test('the spring can be picked up from the floor while still taking the pen apart', () => {
  const m = new PenModel();
  m.take('tip');
  assert.deepEqual(kinds(m.take('spring')), ['found']);
  m.take('refill');
  assert.deepEqual(kinds(m.take('button')), ['off', 'phase']);
  assert.equal(m.phase, 'together');
});

test('the finished pen is checked by clicking its button', () => {
  const m = apart();
  m.take('spring');
  for (const p of ASSEMBLY) m.take(p);
  assert.equal(m.phase, 'check');
  assert.deepEqual(m.take('tip'), []);
  assert.deepEqual(kinds(m.take('button')), ['click', 'phase']);
  assert.equal(m.phase, 'done');
  assert.deepEqual(m.take('button'), []);
});

test('when time runs out the general finishes the pen', () => {
  const m = new PenModel();
  m.take('tip');
  m.finishForThem();
  assert.equal(m.phase, 'done');
  for (const p of ASSEMBLY) assert.equal(m.where[p], 'pen');
});

test('score: full within the norm, lower with time and mistakes, capped when the general took over', () => {
  assert.equal(penScore({ seconds: 15, mistakes: 0, blind: false, timedOut: false }), 1);
  assert.equal(penScore({ seconds: PEN_LIMIT.sighted, mistakes: 0, blind: false, timedOut: false }), 0.35);
  assert.ok(penScore({ seconds: 30, mistakes: 0, blind: false, timedOut: false }) < 1);
  assert.equal(penScore({ seconds: PEN_NORM.blind, mistakes: 2, blind: true, timedOut: false }), 0.8);
  assert.ok(penScore({ seconds: PEN_NORM.blind, mistakes: 0, blind: true, timedOut: false }) > penScore({ seconds: PEN_NORM.blind, mistakes: 0, blind: false, timedOut: false }));
  assert.equal(penScore({ seconds: 10, mistakes: 0, blind: false, timedOut: true }), 0.3);
  assert.equal(penScore({ seconds: 200, mistakes: 20, blind: true, timedOut: false }), 0);
});

test('the general says the seconds with the right word', () => {
  assert.equal(secondsSaid(1), '1 секунда');
  assert.equal(secondsSaid(3), '3 секунды');
  assert.equal(secondsSaid(11), '11 секунд');
  assert.equal(secondsSaid(19), '19 секунд');
  assert.equal(secondsSaid(21), '21 секунда');
  assert.equal(secondsSaid(44), '44 секунды');
  assert.equal(secondsSaid(112), '112 секунд');
});

test('parts lie in a row in order, or mixed far enough apart to be told by touch', () => {
  const order: PartId[] = ['tip', 'spring', 'refill', 'button'];
  const row = tableSpots(order, null);
  const xs = order.map((p) => row[p]![0]);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
  for (let seed = 1; seed < 30; seed++) {
    const mixed = tableSpots(order, seededRng(seed));
    const pts = order.map((p) => mixed[p]!);
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1]) >= 90, `seed ${seed}: ${order[i]} and ${order[j]} too close`);
  }
});
