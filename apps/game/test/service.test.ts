import assert from 'node:assert/strict';
import { test } from 'node:test';
import { instrumental, muster, newRoster, PLAYER_FACE, rankWord, senior } from '../src/core/service.ts';

test('the fallen come back with the same face and a new name, as privates who arrived this cycle', () => {
  const r = newRoster('Иванова');
  const m = muster(r, 2, ['syrkov'], 1);
  assert.deepEqual(m.events[0], { face: 'syrkov', left: 'Сырков', arrived: 'Пышкин' });
  assert.equal(r.syrkov!.name, 'Пышкин');
  assert.equal(r.syrkov!.since, 2);
  assert.equal(r.syrkov!.rank, 0);
});

test('the player comes back under the name they give', () => {
  const r = newRoster('Иванова');
  muster(r, 2, [PLAYER_FACE], 5, 'Петрова');
  assert.equal(r[PLAYER_FACE]!.name, 'Петрова');
  assert.equal(r[PLAYER_FACE]!.life, 1);
});

test('ranks go to the longest-serving, two at a time; Седой refuses; newcomers get none', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const r = newRoster('Иванова');
    const m = muster(r, 2, ['syrkov'], seed);
    const ranked = m.events.filter((e) => e.rank);
    assert.equal(ranked.length, 2, `seed ${seed}`);
    assert.equal(r.sedoy!.rank, 0);
    assert.equal(r.syrkov!.rank, 0);
    assert.equal(m.general, null);
  }
});

test('the third muster moves the ranked up a step and names a new general by выслуга', () => {
  let player = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const r = newRoster('Иванова');
    muster(r, 2, ['syrkov'], seed);
    const before = Object.entries(r).filter(([, s]) => s.rank === 1).map(([f]) => f);
    const m = muster(r, 3, ['norkin'], seed);
    for (const f of before) if (f !== 'norkin') assert.equal(r[f]!.rank, 2);
    assert.ok(m.general && m.general !== 'sedoy' && m.general !== 'syrkov' && m.general !== 'norkin', `seed ${seed}: ${m.general}`);
    if (m.general === PLAYER_FACE) player++;
  }
  assert.ok(player > 60 && player < 140, `player named ${player}/300`);
});

test('the same seed announces the same muster', () => {
  const a = newRoster('Иванова');
  const b = newRoster('Иванова');
  assert.deepEqual(muster(a, 2, ['syrkov'], 42), muster(b, 2, ['syrkov'], 42));
});

test('the senior present gives the orders', () => {
  const r = newRoster('Иванова');
  r.korochkina!.rank = 1;
  r.norkin!.rank = 2;
  assert.equal(senior(r, ['korochkina', 'norkin', PLAYER_FACE]), 'norkin');
  assert.equal(senior(r, ['korochkina', 'syrkov']), 'korochkina');
  assert.equal(senior(r, ['syrkov']), null);
});

test('instrumental case of names', () => {
  assert.equal(instrumental('Пышкин', false), 'Пышкиным');
  assert.equal(instrumental('Седой', false), 'Седым');
  assert.equal(instrumental('Подвальный', false), 'Подвальным');
  assert.equal(instrumental('Корочкина', true), 'Корочкиной');
  assert.equal(instrumental('Погребов', false), 'Погребовым');
  assert.equal(instrumental('Хвостенко', false), 'Хвостенко');
  assert.equal(instrumental('Вася Пупкин', false), 'Васей Пупкиным');
  assert.equal(instrumental('Маша', true), 'Машей');
  assert.equal(rankWord(0, true), 'рядовая');
  assert.equal(rankWord(1, true), 'ефрейтор');
});

test('the register writes what the player did, under every name', async () => {
  const { newRun } = await import('../src/core/save.ts');
  const { runRecords, recruitsAtTheWall } = await import('../src/core/register.ts');
  const run = { ...newRun('Петрова', 'f', 1), formerNames: ['Иванова'], general: PLAYER_FACE };
  run.flags.push('player_fell_c1', 'recon', 'caught_creature', 'speech_truth', 'krypotkin_killed_one');
  const rec = runRecords(run);
  assert.deepEqual(rec[0], { name: 'Иванова', note: 'выбыла в первом бою; вернулась под именем Петрова' });
  assert.equal(rec[1]!.name, 'Петрова');
  assert.match(rec[1]!.note, /пала в третьем бою; ходила в разведку; взяла тварь живой; генералом сказала правду/);
  assert.deepEqual(rec[2], { name: 'Крыпоткин', note: 'пал смертью храбрых' });
  run.roster.syrkov!.life = 1;
  assert.deepEqual(recruitsAtTheWall(run, ['norkin', 'syrkov']), ['Норушкин', 'Творожков']);
});

test('a second return is written «во втором бою»', async () => {
  const { newRun } = await import('../src/core/save.ts');
  const { runRecords } = await import('../src/core/register.ts');
  const run = { ...newRun('Кузнецова', 'f', 1), formerNames: ['Петрова', 'Сидорова'] };
  run.flags.push('player_fell_c1', 'player_fell_c2');
  assert.equal(runRecords(run)[1]!.note, 'выбыла во втором бою; вернулась под именем Кузнецова');
});
