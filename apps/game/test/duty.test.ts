import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inside, leavesScore, Shading, straightness, type Pt } from '../src/stages/duty/leavesModel.ts';
import { GRACE, SofaModel } from '../src/stages/duty/sofaModel.ts';

const PACE = { react: 0.5, step: 0.5 };

/** Runs the model for `seconds` in small ticks. */
function run(m: SofaModel, seconds: number): string[] {
  const out: string[] = [];
  for (let t = 0; t < seconds; t += 0.05) for (const e of m.tick(0.05)) out.push(e.t === 'step' ? `${e.who}:${e.dir}` : `${e.t}${'who' in e ? `:${e.who}` : ''}`);
  return out;
}

test('the sofa does not move off the floor: lift first', () => {
  const m = new SofaModel(PACE);
  m.give({ kind: 'move', to: -1 });
  assert.deepEqual(m.act('left'), [{ t: 'blocked' }]);
  assert.equal(m.p, 0);
});

test('a pair in step carries the sofa two steps without a drop', () => {
  const m = new SofaModel(PACE);
  m.give({ kind: 'lift' });
  m.act('lift');
  run(m, 1);
  assert.ok(m.done());
  m.give({ kind: 'move', to: -2 });
  run(m, 0.55);
  // The partner has stepped; the player follows within the grace.
  assert.equal(m.q, -1);
  m.act('left');
  run(m, 0.55);
  m.act('left');
  run(m, 0.3);
  assert.ok(m.done());
  assert.equal(m.drops, 0);
  assert.equal(m.followed, 1);
});

test('a player who stays put while the partner walks drops the sofa', () => {
  const m = new SofaModel(PACE);
  m.give({ kind: 'lift' });
  m.act('lift');
  run(m, 1);
  m.give({ kind: 'move', to: -2 });
  const ev = run(m, 0.5 + GRACE + 0.2);
  assert.ok(ev.includes('drop'));
  assert.equal(m.drops, 1);
  assert.equal(m.lp || m.lq, false);
  assert.equal(m.p, m.q);
});

test('going the wrong way drops it at once', () => {
  const m = new SofaModel(PACE);
  m.give({ kind: 'lift' });
  m.act('lift');
  run(m, 1);
  m.give({ kind: 'move', to: -1 });
  run(m, 0.55);
  const ev = m.act('right');
  assert.ok(ev.some((e) => e.t === 'drop'));
});

test('moving without an order is counted as eager', () => {
  const m = new SofaModel(PACE);
  m.give({ kind: 'lift' });
  m.act('lift');
  run(m, 1);
  m.act('left');
  assert.equal(m.early, 1);
});

test('«без таймера»: the partner waits for the player, so lagging never drops the sofa', () => {
  const m = new SofaModel(PACE, true);
  m.give({ kind: 'lift' });
  run(m, 3);
  assert.equal(m.lq, false);
  m.act('lift');
  run(m, 1);
  m.give({ kind: 'move', to: -2 });
  run(m, 5);
  assert.equal(m.q, 0);
  m.act('left');
  run(m, 1);
  m.act('left');
  run(m, 1);
  assert.ok(m.done());
  assert.equal(m.drops, 0);
  assert.equal(m.score(), 1);
});

test('the score falls with drops and time out of step', () => {
  const clean = new SofaModel(PACE);
  clean.carried = 30;
  const dropped = new SofaModel(PACE);
  dropped.carried = 30;
  dropped.drops = 2;
  assert.equal(clean.score(), 1);
  assert.ok(dropped.score() < 0.5);
});

const SQUARE: Pt[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];

test('a point in a sheet', () => {
  assert.equal(inside(SQUARE, 50, 50), true);
  assert.equal(inside(SQUARE, 150, 50), false);
});

test('shading covers the sheet and counts what went over the edge', () => {
  const s = new Shading(SQUARE, 10, 30);
  for (let y = 5; y < 100; y += 10) s.stroke([5, y], [95, y], 6);
  assert.ok(s.coverage() > 0.95, `coverage ${s.coverage()}`);
  assert.equal(s.overrun(), 0);
  s.stroke([95, 50], [125, 50], 6);
  assert.ok(s.overrun() > 0);
});

test('straight is 1, crooked is less, and the score rewards a full, clean, straight sheet', () => {
  assert.equal(straightness(0, 0), 1);
  assert.ok(straightness(20, 0.1) < 0.5);
  assert.ok(leavesScore(0.95, 0, 1) > 0.9);
  assert.ok(leavesScore(0.5, 0.2, 0.5) < 0.5);
});
