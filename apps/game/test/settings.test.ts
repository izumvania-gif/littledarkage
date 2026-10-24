import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, parseSettings } from '../src/core/settings.ts';

test('settings saved before hints, volumes and keys load with the defaults for them', () => {
  const old = parseSettings(JSON.stringify({ output: 'speakers', largeText: true, reduceFlashes: false, noTimer: true, captions: null }));
  assert.equal(old.output, 'speakers');
  assert.equal(old.largeText, true);
  assert.equal(old.noTimer, true);
  assert.equal(old.blindHints, false);
  assert.deepEqual(old.volume, { master: 1, music: 1, effects: 1 });
  assert.deepEqual(old.keys, {});
});

test('volumes are clamped and keys are kept only when they look like key codes', () => {
  const s = parseSettings(JSON.stringify({ volume: { master: 2, music: -1, effects: 0.4 }, keys: { KeyL: 'KeyA', KeyA: 'KeyA', '<b>': 'KeyD', KeyO: 42 } }));
  assert.deepEqual(s.volume, { master: 1, music: 0, effects: 0.4 });
  assert.deepEqual(s.keys, { KeyL: 'KeyA' });
});

test('broken settings fall back to the defaults, which are not shared', () => {
  const s = parseSettings('{oops');
  assert.deepEqual(s, DEFAULT_SETTINGS);
  s.volume.music = 0;
  assert.equal(DEFAULT_SETTINGS.volume.music, 1);
});
