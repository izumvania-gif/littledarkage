import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrivedLine, pickStats, statLine } from '../src/net/stats.ts';
import type { RegisterResponse } from '../src/net/api.ts';

const register: RegisterResponse = {
  arrived: 4817,
  stats: [
    { key: 'covered', percent: 41 },
    { key: 'krypotkinKill', percent: 23 },
    { key: 'newGeneral', percent: 10 },
  ],
};

test('the count reads as Russian print has it', () => {
  assert.equal(arrivedLine(4817).replace(/\s/g, ' '), 'Новобранцев прибыло: 4 817');
});

test('a first-timer hears nothing that spoils the story; a veteran may hear anything', () => {
  for (let i = 0; i < 20; i++) assert.deepEqual(pickStats(register, false, () => i / 20), ['41% координаторов приняли удар за напарника']);
  const seen = new Set<string>();
  for (let i = 0; i < 20; i++) for (const l of pickStats(register, true, () => i / 20, 3)) seen.add(l);
  assert.equal(seen.size, 3);
  assert.equal(statLine({ key: 'krypotkinKill', percent: 23.4 }), 'Крыпоткину помогли убить тварь в 23% прогонов');
});

test('unknown keys from a newer server are skipped', () => {
  const r = { arrived: 1, stats: [{ key: 'somethingNew', percent: 5 }] } as unknown as RegisterResponse;
  assert.deepEqual(pickStats(r, true, Math.random), []);
});
