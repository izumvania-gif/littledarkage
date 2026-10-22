import assert from 'node:assert/strict';
import { test } from 'node:test';
import { letter } from '../src/content/letters.ts';
import { PLAYER_INDEX } from '../src/content/recruits.ts';
import { checkName } from '../src/core/names.ts';
import {
  beats,
  CHILDREN_LETTERS,
  envelopeAddress,
  inSpot,
  lineOrder,
  noticeText,
  refusedNames,
  registerPage,
  replyHeading,
  speechLocked,
  triangleNames,
} from '../src/stages/finale/plan.ts';

const SIX = ['Норушкин', 'Корюшкина', 'Пышкин', 'Погребов', 'Хвостиков', 'Зёрнышкин'];

test('the children\'s letters are 2, 6 and 17, written to nobody', () => {
  assert.deepEqual(CHILDREN_LETTERS, [2, 6, 17]);
  for (const n of CHILDREN_LETTERS) assert.equal(letter(n).hand, 'child');
});

test('every ending goes dark → letters → desk → wall → speech → names → title', () => {
  assert.deepEqual(beats('lineup', 2), ['replies', 'children', 'desk', 'toWall', 'light', 'speech', 'askNames', 'rollCall', 'title']);
  assert.deepEqual(beats('newGeneral', 1), ['replies', 'children', 'desk', 'toWall', 'light', 'speech', 'askNames', 'rollCall', 'title']);
  // No replies written: that part is skipped. The empty wall answers with silence.
  assert.deepEqual(beats('emptyWall', 0), ['children', 'desk', 'toWall', 'light', 'speech', 'askNames', 'silence', 'title']);
});

test('who stands in the spotlight, and whose speech cannot be hurried', () => {
  assert.equal(inSpot('lineup'), 'general');
  assert.equal(inSpot('emptyWall'), 'general');
  assert.equal(inSpot('newGeneral'), 'player');
  assert.equal(speechLocked('newGeneral'), true);
  assert.equal(speechLocked('lineup'), false);
  assert.equal(speechLocked('emptyWall'), false);
});

test('in «Шеренга» the player stands fifth again among the recruits', () => {
  const line = lineOrder('lineup', SIX);
  assert.equal(line.length, 7);
  assert.equal(line.findIndex((s) => s.kind === 'player'), PLAYER_INDEX);
  assert.deepEqual(
    line.filter((s) => s.kind === 'recruit').map((s) => (s.kind === 'recruit' ? s.name : '')),
    SIX,
  );
  // A short line: the player closes it.
  const short = lineOrder('lineup', ['Пышкин', 'Погребов']);
  assert.deepEqual(short.map((s) => s.kind), ['recruit', 'recruit', 'player']);
  // More recruits than places: the wall holds seven.
  assert.equal(lineOrder('lineup', [...SIX, 'Лишний', 'Ещё']).length, 7);
});

test('«Новый генерал» lines up recruits only; the empty wall has nobody', () => {
  const line = lineOrder('newGeneral', SIX);
  assert.equal(line.length, 6);
  assert.ok(line.every((s) => s.kind === 'recruit'));
  assert.deepEqual(lineOrder('emptyWall', SIX), []);
});

test('the new roll call refuses every name already in the book, as the first one did', () => {
  const refused = refusedNames({
    taken: ['Иванов'],
    register: [
      { name: 'Петрова', note: 'выбыла', crossed: true },
      { name: 'Норкин', note: 'выбыл', crossed: false },
    ],
    formerNames: ['Кузнецов'],
    player: { name: 'Сидоров', fem: false },
    recruits: ['Пышкин'],
  });
  for (const name of ['иванов', 'ПЕТРОВА', 'Норкин', 'кузнецов', 'Сидоров', 'Пышкин']) {
    const check = checkName(name, refused);
    assert.ok(!check.ok && check.reason === 'taken', `${name} should be taken`);
  }
  assert.deepEqual(checkName('Смирнов', refused), { ok: true, name: 'Смирнов' });
  // «ё» and «е» are the same name.
  assert.ok(!checkName('Пёшкин', refusedNames({ taken: ['Пешкин'], register: [], formerNames: [], player: { name: 'А', fem: false }, recruits: [] })).ok);
});

test('the desk: one triangle per name, the current one last, no doubles', () => {
  assert.deepEqual(triangleNames(['Кузнецов', 'Сидоров'], 'Сидоров'), ['Кузнецов', 'Сидоров']);
  assert.deepEqual(triangleNames([], 'Сидоров'), ['Сидоров']);
  assert.deepEqual(triangleNames(['Кузнецов', 'кузнецов'], 'Сидоров'), ['Кузнецов', 'Сидоров']);
});

test('the book shows the last entries that fit on its page', () => {
  assert.deepEqual(registerPage([1, 2, 3, 4, 5], 3), { shown: [3, 4, 5], earlier: 2 });
  assert.deepEqual(registerPage([1, 2], 3), { shown: [1, 2], earlier: 0 });
});

test('the white envelope and its notice follow the player\'s gender', () => {
  assert.equal(envelopeAddress('Сидоров', false), 'Семье рядового Сидоров');
  assert.equal(envelopeAddress('Сидорова', true), 'Семье рядовой Сидорова');
  assert.match(noticeText('Сидоров', false), /Ваш сын, рядовой Сидоров, пал смертью храбрых/);
  assert.match(noticeText('Сидорова', true), /Ваша дочь, рядовая Сидорова, пала смертью храбрых/);
});

test('a reply in the dark says which letter it answered', () => {
  assert.equal(replyHeading(9), `На письмо ${letter(9).fromLine}`);
  assert.equal(replyHeading(99), 'Ответ домой');
});
