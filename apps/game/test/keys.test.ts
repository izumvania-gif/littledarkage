import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assign, GAME_KEYS, keyName, keysFor, produces } from '../src/engine/keys.ts';

test('a free key takes a game key; the old key keeps working', () => {
  const r = assign({}, 'KeyA', 'KeyL');
  assert.ok(r.ok);
  assert.deepEqual(r.map, { KeyL: 'KeyA' });
  assert.equal(produces(r.map, 'KeyL'), 'KeyA');
  assert.equal(produces(r.map, 'KeyA'), 'KeyA');
  assert.deepEqual(keysFor(r.map, 'KeyA'), ['KeyL', 'KeyA']);
});

test('a key that already gives another game key is refused, or swapped when asked', () => {
  const refused = assign({}, 'KeyA', 'KeyD');
  assert.deepEqual(refused, { ok: false, reason: 'taken', by: 'KeyD' });
  const swapped = assign({}, 'KeyA', 'KeyD', true);
  assert.ok(swapped.ok);
  assert.deepEqual(swapped.map, { KeyD: 'KeyA', KeyA: 'KeyD' });
  // Every game key still has exactly one way in.
  for (const g of ['KeyA', 'KeyD']) assert.equal(keysFor(swapped.map, g).length, 1);
});

test('taking the old key of a moved game key is no conflict', () => {
  const moved = assign({}, 'KeyA', 'KeyL');
  assert.ok(moved.ok);
  const r = assign(moved.map, 'KeyD', 'KeyA');
  assert.ok(r.ok);
  assert.equal(produces(r.map, 'KeyA'), 'KeyD');
  assert.deepEqual(keysFor(r.map, 'KeyA'), ['KeyL']);
});

test('moving a game key again frees its earlier custom key', () => {
  const a = assign({}, 'KeyA', 'KeyL');
  assert.ok(a.ok);
  const b = assign(a.map, 'KeyA', 'KeyO');
  assert.ok(b.ok);
  assert.deepEqual(b.map, { KeyO: 'KeyA' });
});

test('a chain of swaps stays one key per game key', () => {
  let map = {};
  for (const [g, p] of [['KeyA', 'KeyD'], ['KeyW', 'KeyA'], ['KeyS', 'KeyW']] as const) {
    const r = assign(map, g, p, true);
    assert.ok(r.ok);
    map = r.map;
  }
  const seen = new Set<string>();
  for (const k of GAME_KEYS) {
    const ways = keysFor(map, k.code);
    assert.ok(ways.length >= 1, `${k.code} has no key`);
    for (const p of ways) {
      assert.equal(produces(map, p), k.code);
      assert.ok(!seen.has(p), `${p} gives two game keys`);
      seen.add(p);
    }
  }
});

test('Esc is never moved and nothing goes on it', () => {
  assert.deepEqual(assign({}, 'Escape', 'KeyL'), { ok: false, reason: 'fixed' });
  assert.deepEqual(assign({}, 'KeyA', 'Escape'), { ok: false, reason: 'fixed' });
});

test('keys are named as printed', () => {
  assert.equal(keyName('KeyA'), 'A');
  assert.equal(keyName('Digit7'), '7');
  assert.equal(keyName('Space'), 'Пробел');
  assert.equal(keyName('ArrowLeft'), '←');
  assert.equal(keyName('Semicolon'), ';');
});

test('a spare key (the second «удар» in the brawl) can be taken without a conflict', () => {
  const r = assign({}, 'KeyA', 'KeyJ');
  assert.ok(r.ok);
  assert.deepEqual(r.map, { KeyJ: 'KeyA' });
});
