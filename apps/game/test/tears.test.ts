import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FULL_AT, holeRadius, LINEUP_HOLES, tearPoints, tearShape } from '../src/render/tears.ts';

test('the prologue poster is whole and every hole is fully open by the end', () => {
  for (const h of LINEUP_HOLES) {
    assert.equal(holeRadius(0, h), 0);
    assert.equal(holeRadius(FULL_AT, h), h.max);
    assert.equal(holeRadius(1, h), h.max);
  }
});

test('holes only grow as the game goes on', () => {
  for (const h of LINEUP_HOLES) {
    let last = 0;
    for (let t = 0; t <= 1; t += 0.01) {
      const r = holeRadius(t, h);
      assert.ok(r >= last);
      last = r;
    }
  }
});

test('a tear keeps its shape from frame to frame', () => {
  assert.deepEqual(tearShape(900), tearShape(900));
  const h = LINEUP_HOLES[0]!;
  const pts = tearPoints(h, 100, tearShape(900), 0);
  assert.equal(pts.length, 60);
  assert.ok(pts.every(Number.isFinite));
});
