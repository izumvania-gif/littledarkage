import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SPEECH } from '../src/content/speech.ts';

test('the general speaks the same words as the draft in the concept', () => {
  const concept = readFileSync(new URL('../../../docs/concept.md', import.meta.url), 'utf8');
  const start = concept.indexOf('### Речь генерала');
  assert.ok(start > 0, 'the concept has the speech section');
  const section = concept.slice(start, concept.indexOf('\n### ', start + 10));
  const draft = section
    .split('\n')
    .filter((l) => l.startsWith('> ') && l.length > 2)
    .map((l) => l.slice(2));
  assert.deepEqual([...SPEECH], draft);
});
