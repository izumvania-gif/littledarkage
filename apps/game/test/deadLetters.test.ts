import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEAD_LETTERS, mixLetters, replyAddressee } from '../src/content/deadLetters.ts';
import { LETTERS } from '../src/content/letters.ts';
import { PLAYER_ID } from '../src/content/soldiers.ts';
import { LETTER_ADDRESSEES, MAX_LETTER_LENGTH } from '../src/net/api.ts';

const addressees = new Set<string>(LETTER_ADDRESSEES);

test('authored undelivered letters: known addressees, unique ids, letter-sized texts', () => {
  assert.ok(DEAD_LETTERS.length >= 8);
  assert.equal(new Set(DEAD_LETTERS.map((l) => l.id)).size, DEAD_LETTERS.length);
  for (const l of DEAD_LETTERS) {
    assert.ok(addressees.has(l.to), `${l.id}: «${l.to}»`);
    assert.ok(l.text.length >= 120 && l.text.length <= MAX_LETTER_LENGTH, `${l.id}: ${l.text.length} chars`);
    assert.ok(l.from.trim() && /^\d{4}$/.test(l.post), l.id);
    assert.doesNotMatch(l.text, /[<>{}]/, `${l.id}: markup in the text`);
  }
});

test('the box holds letters to an unknown defender, returned ones and ones never sent', () => {
  assert.ok(DEAD_LETTERS.some((l) => l.to === 'Незнакомому защитнику'));
  assert.ok(DEAD_LETTERS.some((l) => l.stamp === 'Адресат выбыл'));
  assert.ok(DEAD_LETTERS.some((l) => l.stamp === 'Не отправлено'));
});

test('a reply to every letter from home addressed to the player goes to someone on the list', () => {
  const toPlayer = LETTERS.filter((l) => l.to === PLAYER_ID);
  assert.ok(toPlayer.length >= 2);
  for (const l of toPlayer) {
    const to = replyAddressee(l.n);
    assert.ok(addressees.has(to), `letter ${l.n}: «${to}»`);
    assert.notEqual(to, 'Домой', `letter ${l.n} from «${l.from}» should name its sender`);
  }
  assert.equal(replyAddressee(9), 'Другу');
  assert.equal(replyAddressee(7), 'Сестре');
  // Every sender of the run maps to someone on the list, and an unknown letter goes home.
  for (const l of LETTERS) assert.ok(addressees.has(replyAddressee(l.n)));
  assert.equal(replyAddressee(999), 'Домой');
});

test('mixing keeps every letter, is the same for the same seed and puts others among the authored', () => {
  const authored = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const others = ['x', 'y', 'z'];
  const one = mixLetters(authored, others, 42);
  assert.deepEqual(one, mixLetters(authored, others, 42));
  assert.deepEqual([...one].sort(), [...authored, ...others].sort());
  assert.deepEqual(one.filter((s) => authored.includes(s)), authored, 'the authored keep their order');
  assert.notDeepEqual(mixLetters(authored, others, 1), mixLetters(authored, others, 2));
  assert.deepEqual(mixLetters(authored, [], 7), authored);
});
