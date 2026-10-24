import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fieldLines, letters, scentLines, sideWord } from '../src/agent/describe.ts';
import { makeBattle, smell, visible, type Battle } from '../src/core/battle.ts';
import { PLAYER_ID } from '../src/content/soldiers.ts';

/** The player at (4,7) facing the far end with Норкин's voice, a second striker at (2,5), and what is given. */
function field(): Battle {
  const b = makeBattle({ seed: 1, pairs: [], weak: 0, traps: 0, secrets: 0, retreatAfter: 8, maxTurns: 8 });
  b.units.push({ id: PLAYER_ID, x: 4, y: 7, dir: 0, hp: 3, alive: true, jump: 2, lost: 0, bonus: 0, actions: 3, sniffed: false, bag: false, coord: 'norkin', fate: 'free' });
  b.units.push({ id: 'sedoy', x: 2, y: 5, dir: 1, hp: 2, alive: true, jump: 2, lost: 0, bonus: 0, actions: 3, sniffed: false, bag: true, coord: null, fate: 'free' });
  b.creatures.push({ id: b.nextId++, x: 4, y: 5, strong: false, alive: true, caught: false });
  b.creatures.push({ id: b.nextId++, x: 6, y: 7, strong: true, alive: true, caught: false });
  b.traps.push({ x: 0, y: 0, kind: 'snare', sprung: false }, { x: 1, y: 1, kind: 'snare', sprung: true });
  return b;
}

const nameOf = (id: string) => ({ [PLAYER_ID]: 'Иванова', sedoy: 'Седой', norkin: 'Норкин' })[id] ?? id;

test('the player is Я, the others take letters in order', () => {
  const tag = letters(field());
  assert.equal(tag.get(PLAYER_ID), 'Я');
  assert.equal(tag.get('sedoy'), 'A');
});

test('the field shows strikers with their facing, creatures, and only the traps someone stepped on', () => {
  const lines = fieldLines(visible(field()), nameOf, []);
  const row = (y: number) => lines.find((l) => l.startsWith(`${String(y).padStart(2)}  `))!;
  assert.match(row(7), /Я\^/);
  assert.match(row(7), /W/);
  assert.match(row(5), /A>/);
  assert.match(row(5), /w/);
  assert.match(row(1), /x/);
  assert.doesNotMatch(row(0), /x/);
  assert.ok(lines.some((l) => l.startsWith('Я — Иванова (голос — Норкин): клетка 4,7, смотрит к дальнему краю, хитов 3')));
  assert.ok(lines.some((l) => l.startsWith('A — Седой (без голоса)') && l.includes('с мешком')));
  assert.ok(lines.some((l) => l === 'Тварей на поле: 2, из них сильных 1.'));
});

test('the coordinator is told which strikers he speaks for', () => {
  const lines = fieldLines(field(), nameOf, ['sedoy']);
  assert.ok(lines.some((l) => l.startsWith('A — Седой (говорите за него вы)')));
});

test('a blind striker smells only a rough side until he sniffs', () => {
  const scents = smell(field(), PLAYER_ID, 3);
  const haze = scentLines(scents, false);
  assert.equal(haze.length, 2);
  assert.ok(haze.some((l) => l.startsWith('запах твари — впереди')));
  assert.ok(haze.some((l) => l.startsWith('тяжёлый, чужой запах — справа')));
  assert.ok(haze.every((l) => !/клеток/.test(l)));
  const sharp = scentLines(scents, true);
  assert.ok(sharp.some((l) => l.includes('2 вперёд')));
  assert.ok(sharp.some((l) => l.includes('2 вправо')));
  assert.deepEqual(scentLines([], false), ['Запаха тварей рядом нет.']);
});

test('sides are named from where the striker looks', () => {
  assert.equal(sideWord(1, 1), 'впереди справа');
  assert.equal(sideWord(-1, 0), 'слева');
  assert.equal(sideWord(0, -2), 'сзади');
  assert.equal(sideWord(0, 0), 'вплотную');
});
