import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AHEAD, ringOf, sectorCells, wedgeOf } from '../src/stages/battle/striker/sectors.ts';

const CELL = 105;
/** Like the haze: from a scent's «right» and «ahead» cells to the screen angle and distance. */
const whiff = (right: number, ahead: number, amp = 1, strong = false) => ({ phi: Math.atan2(-ahead, right), r: Math.hypot(right, ahead) * CELL, amp, strong });

test('directions fall into the eight wedges, clockwise from ahead', () => {
  assert.equal(wedgeOf(AHEAD), 0);
  assert.equal(wedgeOf(whiff(1, 0).phi), 2);
  assert.equal(wedgeOf(whiff(0, -1).phi), 4);
  assert.equal(wedgeOf(whiff(-1, 0).phi), 6);
  assert.equal(wedgeOf(whiff(1, 1).phi), 1);
});

test('distances fall into three rings; beyond the last stays in the last', () => {
  assert.equal(ringOf(1 * CELL), 0);
  assert.equal(ringOf(2 * CELL), 1);
  assert.equal(ringOf(Math.hypot(2, 2) * CELL), 2);
  assert.equal(ringOf(9 * CELL), 2);
});

test('plain, the whole wedge fills; sniffed, only the cell — strong ones marked', () => {
  const plain = sectorCells([whiff(0, 2, 1, true)], false);
  assert.ok(plain.fill.every((ring) => ring[0]! > 0 && ring[0]! < 1));
  assert.ok(plain.strong.every((ring) => !ring[0]));
  const sharp = sectorCells([whiff(0, 2, 1, true)], true);
  assert.deepEqual(sharp.fill.map((ring) => ring[0]), [0, 1, 0]);
  assert.equal(sharp.strong[1]![0], true);
  assert.equal(sharp.fill.flat().filter((v) => v > 0).length, 1);
});
