import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { addressee, letter, LETTERS, lettersFor, letterText } from '../src/content/letters.ts';
import { PLAYER_ID } from '../src/content/soldiers.ts';

test('all seventeen letters, each once', () => {
  assert.deepEqual(
    LETTERS.map((l) => l.n),
    Array.from({ length: 17 }, (_, i) => i + 1),
  );
});

test('adult spelling is fixed: no «комунна», no doubled letters from the source typos', () => {
  for (const l of LETTERS) {
    for (const t of [l.text, l.textF ?? '']) {
      assert.doesNotMatch(t, /комунн/i, `letter ${l.n}`);
      assert.doesNotMatch(t, /хвататет|некотоорые|повесилиться|неначем|\bеше\b/, `letter ${l.n}`);
    }
  }
});

test('the child\'s letter 6 keeps its spelling exactly', () => {
  const source = readFileSync(new URL('../../../docs/source/letters.md', import.meta.url), 'utf8');
  const quoted = source.split('## 6')[1]!.split('## 7')[0]!;
  const original = quoted
    .split('\n')
    .filter((line) => line.startsWith('> '))
    .map((line) => line.slice(2))
    .join(' ');
  assert.equal(letter(6).text, original);
});

test('the player\'s letters change their address for рядовая and read naturally', () => {
  for (const n of [7, 9]) {
    assert.notEqual(letterText(n, 'f'), letterText(n, 'm'));
    assert.equal(letterText(n, 'm'), letter(n).text);
  }
  const nine = letterText(9, 'f');
  assert.match(nine, /^Привет, дорогая подруга!/);
  assert.match(nine, /храброй, мужественной, смелой/);
  assert.match(nine, /не закончила учебу/);
  assert.doesNotMatch(nine, /дорогой друг|храбрым|закончил /);
  const seven = letterText(7, 'f');
  assert.match(seven, /^Здравствуй, дорогая сестрёнка!/);
  assert.match(seven, /не писала письма/);
  assert.match(seven, /жива и здорова/);
  assert.doesNotMatch(seven, /брат!|братец|не писал |жив и здоров/);
  // Letters to others don't change.
  assert.equal(letterText(14, 'f'), letterText(14, 'm'));
});

test('who gets which letter follows the concept\'s table', () => {
  assert.deepEqual(
    lettersFor(PLAYER_ID, 1).map((l) => l.n),
    [9],
  );
  assert.deepEqual(
    lettersFor(PLAYER_ID, 2).map((l) => l.n),
    [7],
  );
  assert.deepEqual(
    lettersFor('norkin', 1).map((l) => l.n),
    [14],
  );
  assert.equal(letter(14).cycle, 1);
  assert.equal(letter(15).to, 'podvalny');
  assert.equal(letter(11).readBy, 'pyshkin');
  for (const n of [2, 6, 17]) assert.equal(letter(n).to, null);
  assert.equal(addressee('Петрова'), 'Кому: Петрова');
});
