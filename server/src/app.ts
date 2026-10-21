import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';

export interface AppOptions {
  /** Built client (apps/game/dist). Skipped when missing, e.g. in tests. */
  staticDir?: string;
  /** Built throwaway prototypes (prototypes/dist), served under /proto/. Skipped when missing. */
  protoDir?: string;
  logger?: boolean;
}

/** For now the server only serves the game; the online layer (register, letters without address) is postponed. */
export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const { staticDir, protoDir, logger = false } = opts;
  const app = Fastify({ logger, trustProxy: true, bodyLimit: 4096 });

  app.get('/api/health', async () => ({ ok: true }));

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
  return app;
}
