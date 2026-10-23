import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.ts';
import { openStore } from '../src/db.ts';
import { cleanLetter, LETTER_ADDRESSEES } from '../src/letters.ts';
import { ARRIVED_FIRST, BASELINE, STAT_KEYS } from '../src/register.ts';

const RUN = { ending: 'lineup', covered: true, krypotkinKill: false, recon: true, caught: false, mutiny: false, general: false, speech: null, returned: 0 };
const free = { arrivalCooldownMs: 0, runCooldownMs: 0, letterCooldownMs: 0 };

test('register: the count starts from the world and grows with every name', async () => {
  const app = await buildApp({ store: openStore(':memory:'), ...free });
  const first = (await app.inject({ method: 'GET', url: '/api/register' })).json();
  assert.equal(first.arrived, ARRIVED_FIRST);
  const one = await app.inject({ method: 'POST', url: '/api/register/arrived' });
  assert.equal(one.json().arrived, 4817);
  assert.equal((await app.inject({ method: 'GET', url: '/api/register' })).json().arrived, 4817);
  await app.close();
});

test('register: names from one IP are rate limited and the count is returned unchanged', async () => {
  const app = await buildApp({ store: openStore(':memory:'), arrivalCooldownMs: 60_000 });
  assert.equal((await app.inject({ method: 'POST', url: '/api/register/arrived' })).statusCode, 200);
  const again = await app.inject({ method: 'POST', url: '/api/register/arrived' });
  assert.equal(again.statusCode, 429);
  assert.equal(again.json().arrived, ARRIVED_FIRST + 1);
  await app.close();
});

test('register: shares start from the baseline and move with finished runs', async () => {
  const app = await buildApp({ store: openStore(':memory:'), ...free });
  const before = (await app.inject({ method: 'GET', url: '/api/register' })).json().stats as { key: string; percent: number }[];
  assert.deepEqual(
    before.map((s) => s.key),
    [...STAT_KEYS],
  );
  assert.equal(before.find((s) => s.key === 'covered')?.percent, 41);
  assert.equal(before.find((s) => s.key === 'krypotkinKill')?.percent, 23);
  const endings = BASELINE.lineup + BASELINE.newGeneral + BASELINE.emptyWall;
  assert.equal(endings, BASELINE.runs);

  for (let i = 0; i < 100; i++) {
    const res = await app.inject({ method: 'POST', url: '/api/runs', payload: { ...RUN, krypotkinKill: true, ending: 'emptyWall', extra: 'ignored' } });
    assert.equal(res.statusCode, 200);
  }
  const after = (await app.inject({ method: 'GET', url: '/api/register' })).json().stats as { key: string; percent: number }[];
  const pct = (k: string) => after.find((s) => s.key === k)?.percent;
  assert.equal(pct('krypotkinKill'), Math.round((100 * (BASELINE.krypotkinKill + 100)) / (BASELINE.runs + 100)));
  assert.equal(pct('emptyWall'), Math.round((100 * (BASELINE.emptyWall + 100)) / (BASELINE.runs + 100)));
  assert.equal(pct('mutiny'), Math.round((100 * BASELINE.mutiny) / (BASELINE.runs + 100)));
  await app.close();
});

test('runs: anything but a well-formed report is refused', async () => {
  const app = await buildApp({ store: openStore(':memory:'), ...free });
  const bad = [
    null,
    [],
    { ...RUN, ending: 'victory' },
    { ...RUN, covered: 'yes' },
    { ...RUN, speech: 'long' },
    { ...RUN, returned: 3 },
    { ...RUN, returned: 1.5 },
    { ...RUN, general: undefined },
  ];
  for (const payload of bad) {
    const res = await app.inject({ method: 'POST', url: '/api/runs', payload: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });
    assert.equal(res.statusCode, 400, JSON.stringify(payload));
  }
  assert.equal((await app.inject({ method: 'POST', url: '/api/runs', payload: { ...RUN, general: true, speech: 'truth', returned: 2 } })).statusCode, 200);
  await app.close();
});

test('runs: one report per IP per cooldown, and only counters are stored', async () => {
  const store = openStore(':memory:');
  const app = await buildApp({ store, runCooldownMs: 60_000 });
  assert.equal((await app.inject({ method: 'POST', url: '/api/runs', payload: RUN })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/runs', payload: RUN })).statusCode, 429);
  assert.deepEqual(store.counters(), { runs: 1, lineup: 1, returned_0: 1, covered: 1, recon: 1 });
  await app.close();
});

test('letters: premoderated — nothing is visible until approved', async () => {
  const app = await buildApp({ store: openStore(':memory:'), ...free, adminToken: 'secret' });
  const text = 'Сестрёнка, я писал. Честно писал.\n\nПочта тут медленная.';
  assert.equal((await app.inject({ method: 'POST', url: '/api/letters', payload: { to: 'Сестре', text } })).statusCode, 200);
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/letters' })).json().letters, []);

  const unauthorized = await app.inject({ method: 'GET', url: '/api/admin/letters' });
  assert.equal(unauthorized.statusCode, 401);
  const auth = { authorization: 'Bearer secret' };
  const pending = (await app.inject({ method: 'GET', url: '/api/admin/letters?status=pending', headers: auth })).json().letters;
  assert.equal(pending.length, 1);
  assert.equal(pending[0].to, 'Сестре');
  assert.equal(pending[0].text, text);

  const approve = await app.inject({ method: 'POST', url: `/api/admin/letters/${pending[0].id}`, headers: auth, payload: { status: 'approved' } });
  assert.equal(approve.statusCode, 200);
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/letters' })).json().letters, [{ id: pending[0].id, to: 'Сестре', text }]);
  assert.equal((await app.inject({ method: 'POST', url: '/api/admin/letters/999', headers: auth, payload: { status: 'rejected' } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: `/api/admin/letters/${pending[0].id}`, headers: auth, payload: { status: 'pending' } })).statusCode, 400);
  await app.close();
});

test('letters: unknown addressees and refused texts are 400, a second letter from one IP waits', async () => {
  const app = await buildApp({ store: openStore(':memory:'), letterCooldownMs: 60_000 });
  assert.equal((await app.inject({ method: 'POST', url: '/api/letters', payload: { to: 'Генералу', text: 'Здравствуйте.' } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/api/letters', payload: { to: 'Маме', text: 'заходи на сайт.ru' } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/api/letters', payload: { to: 'Маме', text: 'Мама, я жив.' } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/letters', payload: { to: 'Маме', text: 'Мама, я жив. Опять.' } })).statusCode, 429);
  await app.close();
});

test('letters: how many come back is clamped', async () => {
  const store = openStore(':memory:');
  for (let i = 0; i < 20; i++) store.setLetterStatus(store.addLetter('Домой', `Письмо ${i}.`), 'approved');
  const app = await buildApp({ store });
  const count = async (q: string) => (await app.inject({ method: 'GET', url: `/api/letters${q}` })).json().letters.length;
  assert.equal(await count(''), 6);
  assert.equal(await count('?n=50'), 12);
  assert.equal(await count('?n=0'), 1);
  assert.equal(await count('?n=abc'), 6);
  await app.close();
});

test('the letter filter: what a letter home may hold', () => {
  const ok = [
    'Мама, у нас всё хорошо. Кормят!',
    '«Не помру» — так и передай.\nЦелую, твой сын.',
    'Здравствуй, незнакомый защитник! Пишу тебе в 3 часа ночи, 12-го числа.',
    'Ты почему не писал? №7 пришло, остальных нет… (ничего)',
    'Мы страхуем друг друга. Генерал не любит, когда употребляют лишние слова.',
    'Небо тут не видно. Хлеб — да.',
  ];
  for (const t of ok) assert.ok(cleanLetter(t), t);
  const refused = [
    '',
    'а',
    'x'.repeat(601),
    'смотри https://example.org',
    'пиши на www.mail',
    'мой ящик vasya@mail',
    'телефон 8 912 345 67 89',
    'а пошёл ты на хуй',
    'пиздец тут',
    'ёбаный туннель',
    'бля, опять тревога',
    'blyat <script>',
    'fuck this',
  ];
  for (const t of refused) assert.equal(cleanLetter(t), null, t);
  assert.equal(cleanLetter('  Мама,\t\tпривет.  \r\n\n\n\n\n\nЯ  жив.  '), 'Мама, привет.\n\n\nЯ жив.');
  assert.ok(LETTER_ADDRESSEES.includes('Незнакомому защитнику'));
});

test('the database keeps letters and counters on disk', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lda-data-'));
  const a = openStore(dir);
  a.recordArrival();
  a.setLetterStatus(a.addLetter('Другу', 'Держись там.'), 'approved');
  a.close();
  const b = openStore(dir);
  assert.equal(b.getArrived(), ARRIVED_FIRST + 1);
  assert.deepEqual(
    b.randomApprovedLetters(3).map((l) => l.text),
    ['Держись там.'],
  );
  b.close();
});

test('without ADMIN_TOKEN there is no moderation at all', async () => {
  const app = await buildApp({ store: openStore(':memory:') });
  assert.equal((await app.inject({ method: 'GET', url: '/admin' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: '/api/admin/letters', headers: { authorization: 'Bearer ' } })).statusCode, 404);
  await app.close();
});

test('the admin page is served in Russian when moderation is on', async () => {
  const app = await buildApp({ store: openStore(':memory:'), adminToken: 'secret' });
  const page = await app.inject({ method: 'GET', url: '/admin' });
  assert.equal(page.statusCode, 200);
  assert.match(page.headers['content-type'] ?? '', /text\/html/);
  assert.match(page.body, /Ящик недошедших писем/);
  await app.close();
});
