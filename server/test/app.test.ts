import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.ts';

test('health check', async () => {
  const app = await buildApp();
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/health' })).json(), { ok: true });
  await app.close();
});

test('serves the game and falls back to index.html, but not for unknown API routes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lda-static-'));
  writeFileSync(join(dir, 'index.html'), '<title>Короткий тёмный век</title>');
  const app = await buildApp({ staticDir: dir });
  const page = await app.inject({ method: 'GET', url: '/some/deep/link' });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Короткий тёмный век/);
  const api = await app.inject({ method: 'GET', url: '/api/nope' });
  assert.equal(api.statusCode, 404);
  await app.close();
});
