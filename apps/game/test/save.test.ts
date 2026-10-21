import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACKUP_KEY, freshSave, loadSave, parseSave, retireRun, SAVE_KEY, writeSave, type KeyValue } from '../src/core/save.ts';

function memoryStore(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

test('a written save loads back, and the previous one becomes the backup', () => {
  const store = memoryStore();
  const a = freshSave();
  a.run = { name: 'Иванов', gender: 'm', stage: 'registered' };
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
  s.run = { name: 'Иванов', gender: 'm', stage: 'registered' };
  const once = retireRun(s);
  assert.equal(once.run, null);
  assert.deepEqual(once.memory.names, ['Иванов']);
  assert.deepEqual(retireRun({ ...once, run: s.run }).memory.names, ['Иванов']);
});
