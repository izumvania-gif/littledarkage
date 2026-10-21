import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACKUP_KEY, freshSave, loadSave, newRun, parseSave, retireRun, SAVE_KEY, writeSave, type KeyValue } from '../src/core/save.ts';
import { makeBattle } from '../src/core/battle.ts';

function memoryStore(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

test('a written save loads back, and the previous one becomes the backup', () => {
  const store = memoryStore();
  const a = freshSave();
  a.run = newRun('Иванов', 'm');
  writeSave(store, a);
  const b = { ...loadSave(store), run: null };
  writeSave(store, b);
  assert.equal(loadSave(store).run, null);
  assert.equal(parseSave(store.data.get(BACKUP_KEY) ?? null)?.run?.name, 'Иванов');
  assert.equal(loadSave(store).generation, 2);
});

test('a broken main save falls back to the backup, then to a fresh one', () => {
  const store = memoryStore();
  const a = freshSave();
  a.memory.names = ['Сырков'];
  writeSave(store, a);
  writeSave(store, a);
  store.data.set(SAVE_KEY, '{ not json');
  assert.deepEqual(loadSave(store).memory.names, ['Сырков']);
  store.data.set(BACKUP_KEY, '{"schema":99}');
  assert.deepEqual(loadSave(store), freshSave());
});

test('storage that throws (private mode) does not break the game', () => {
  const throwing: KeyValue = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  };
  assert.deepEqual(loadSave(throwing), freshSave());
  assert.equal(writeSave(throwing, freshSave()), false);
  assert.deepEqual(loadSave(null), freshSave());
});

test('retiring a run crosses its soldier out once', () => {
  const s = freshSave();
  s.run = newRun('Иванов', 'm');
  const once = retireRun(s);
  assert.equal(once.run, null);
  assert.deepEqual(once.memory.names, ['Иванов']);
  assert.deepEqual(retireRun({ ...once, run: s.run }).memory.names, ['Иванов']);
});

test('a schema 2 save that passed the workshop resumes after it', () => {
  const old = JSON.stringify({ schema: 2, generation: 7, run: { name: 'Иванов', gender: 'm', stage: 'trained', hp: 2, trust: { norkin: 2 }, battle: null }, memory: { names: [] } });
  const s = parseSave(old);
  assert.equal(s?.run?.scene, 'amateur');
  assert.equal(s?.run?.hp, 2);
  assert.equal(s?.run?.trust.norkin, 2);
});

test('a schema 1 save migrates: the soldier keeps the name and gets three hits', () => {
  const old = JSON.stringify({ schema: 1, generation: 4, run: { name: 'Петрова', gender: 'f', stage: 'registered' }, memory: { names: ['Сырков'] } });
  const s = parseSave(old);
  assert.equal(s?.schema, 3);
  assert.deepEqual(s?.run, { name: 'Петрова', gender: 'f', scene: 'workshop', hp: 3, trust: { norkin: 1 }, flags: [], replies: {}, battle: null });
  assert.deepEqual(s?.memory.names, ['Сырков']);
});

test('a battle in progress saves and loads; a broken one is dropped, the run stays', () => {
  const store = memoryStore();
  const s = freshSave();
  s.run = newRun('Иванов', 'm');
  const state = makeBattle({ seed: 3, pairs: [{ striker: 'norkin', coord: 'player', x: 4 }], weak: 2, traps: 1, secrets: 1, retreatAfter: 8, maxTurns: 8 });
  s.run.battle = { id: 'b1', state, memory: { trust: 2, partnerScared: true, playerScared: false, stats: { crushed: 1 } } };
  writeSave(store, s);
  assert.deepEqual(loadSave(store).run?.battle?.state, state);
  const broken = JSON.parse(store.data.get(SAVE_KEY)!);
  broken.run.battle.state.units = 'no';
  assert.equal(parseSave(JSON.stringify(broken))?.run?.battle, null);
  assert.equal(parseSave(JSON.stringify(broken))?.run?.name, 'Иванов');
});
