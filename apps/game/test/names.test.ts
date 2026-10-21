import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkName, MAX_NAME, normalizeName, sameName } from '../src/core/names.ts';

test('names are trimmed, spaced and capitalised', () => {
  assert.equal(normalizeName('  вася   пупкин '), 'Вася Пупкин');
  assert.equal(normalizeName('анна-мария'), 'Анна-мария');
});

test('«ё» and case do not make a name new', () => {
  assert.ok(sameName('Ёжиков', 'ежиков'));
  assert.ok(!sameName('Норкин', 'Норкина'));
});

test('a former soldier’s name is taken', () => {
  assert.deepEqual(checkName('норкин', ['Норкин']), { ok: false, reason: 'taken' });
  assert.deepEqual(checkName('Иванов', ['Норкин']), { ok: true, name: 'Иванов' });
});

test('empty, too long or odd names are refused', () => {
  assert.deepEqual(checkName('   ', []), { ok: false, reason: 'empty' });
  assert.deepEqual(checkName('а'.repeat(MAX_NAME + 1), []), { ok: false, reason: 'long' });
  assert.deepEqual(checkName('R2D2', []), { ok: false, reason: 'chars' });
  assert.deepEqual(checkName('O’Brien', []), { ok: false, reason: 'chars' });
  assert.equal(checkName("D'Artagnan", []).ok, true);
});
