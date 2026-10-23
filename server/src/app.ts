import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { ADMIN_PAGE } from './admin.ts';
import { openStore, type Store } from './db.ts';
import { cleanLetter, isAddressee, LETTER_STATUSES, type LetterStatus } from './letters.ts';
import { runCounters, shares, validateRun } from './register.ts';

export interface AppOptions {
  /** The database; an in-memory one when missing (tests that only need the static routes). */
  store?: Store;
  /** Built client (apps/game/dist). Skipped when missing, e.g. in tests. */
  staticDir?: string;
  /** Built throwaway prototypes (prototypes/dist), served under /proto/. Skipped when missing. */
  protoDir?: string;
  /** Minimum milliseconds between two names counted from the same IP. */
  arrivalCooldownMs?: number;
  /** Minimum milliseconds between two finished runs reported from the same IP. */
  runCooldownMs?: number;
  /** Minimum milliseconds between two letters put in the box from the same IP. */
  letterCooldownMs?: number;
  /** Enables /admin and /api/admin/*. Unset = the moderation endpoints do not exist. */
  adminToken?: string;
  logger?: boolean;
}

/** Remembers when each IP last did something; true if it may do it again now. Forgets everyone past 10 000 IPs. */
function cooldown(ms: number): (ip: string) => boolean {
  const last = new Map<string, number>();
  return (ip) => {
    const now = Date.now();
    const at = last.get(ip);
    if (at !== undefined && now - at < ms) return false;
    last.set(ip, now);
    if (last.size > 10_000) last.clear();
    return true;
  };
}

/**
 * The game's server: it serves the client and the prototypes, and the online layer (concept §7) — the shared
 * register (how many recruits arrived, what share of runs did what) and the box of undelivered letters,
 * premoderated. The game works without any of it.
 */
export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const { staticDir, protoDir, arrivalCooldownMs = 10_000, runCooldownMs = 60_000, letterCooldownMs = 60_000, adminToken, logger = false } = opts;
  const store = opts.store ?? openStore(':memory:');
  const app = Fastify({ logger, trustProxy: true, bodyLimit: 4096 });
  const mayArrive = cooldown(arrivalCooldownMs);
  const mayReport = cooldown(runCooldownMs);
  const mayPost = cooldown(letterCooldownMs);

  app.get('/api/health', async () => ({ ok: true }));

  // The shared register.
  app.get('/api/register', async () => ({ arrived: store.getArrived(), stats: shares(store.counters()) }));

  app.post('/api/register/arrived', async (req, reply) => {
    if (!mayArrive(req.ip)) return reply.code(429).send({ error: 'too_many_arrivals', arrived: store.getArrived() });
    return { arrived: store.recordArrival() };
  });

  app.post('/api/runs', async (req, reply) => {
    const run = validateRun(req.body);
    if (!run) return reply.code(400).send({ error: 'invalid_run' });
    if (!mayReport(req.ip)) return reply.code(429).send({ error: 'too_many_runs' });
    store.bump(runCounters(run));
    return { ok: true };
  });

  // The box of undelivered letters: only approved letters are ever shown.
  app.get('/api/letters', async (req) => {
    const n = Number((req.query as { n?: string }).n ?? 6);
    const count = Number.isFinite(n) ? Math.max(1, Math.min(12, Math.trunc(n))) : 6;
    return { letters: store.randomApprovedLetters(count) };
  });

  app.post('/api/letters', async (req, reply) => {
    const body = req.body as { to?: unknown; text?: unknown } | null;
    const text = cleanLetter(body?.text);
    const to = body?.to;
    if (!text || !isAddressee(to)) return reply.code(400).send({ error: 'invalid_letter' });
    if (!mayPost(req.ip)) return reply.code(429).send({ error: 'too_many_letters' });
    store.addLetter(to, text);
    // Always «queued»: the player never learns whether a letter was approved.
    return { ok: true };
  });

  if (adminToken) {
    const authorized = (header: string | undefined) => header === `Bearer ${adminToken}`;
    app.get('/admin', async (_req, reply) => reply.type('text/html; charset=utf-8').send(ADMIN_PAGE));
    app.get('/api/admin/letters', async (req, reply) => {
      if (!authorized(req.headers.authorization)) return reply.code(401).send({ error: 'unauthorized' });
      const status = (req.query as { status?: string }).status ?? 'pending';
      if (!(LETTER_STATUSES as readonly string[]).includes(status)) return reply.code(400).send({ error: 'bad_status' });
      return { letters: store.lettersByStatus(status as LetterStatus, 200) };
    });
    app.post('/api/admin/letters/:id', async (req, reply) => {
      if (!authorized(req.headers.authorization)) return reply.code(401).send({ error: 'unauthorized' });
      const status = (req.body as { status?: string } | null)?.status;
      if (status !== 'approved' && status !== 'rejected') return reply.code(400).send({ error: 'bad_status' });
      const ok = store.setLetterStatus(Number((req.params as { id: string }).id), status);
      return ok ? { ok } : reply.code(404).send({ error: 'not_found' });
    });
  }

  if (protoDir && existsSync(protoDir)) {
    await app.register(fastifyStatic, { root: protoDir, prefix: '/proto/', decorateReply: false, redirect: true });
  }
  if (staticDir && existsSync(staticDir)) {
    await app.register(fastifyStatic, { root: staticDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/proto/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'not_found' });
    });
  }

  app.addHook('onClose', async () => store.close());
  return app;
}
