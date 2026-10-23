import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { openStore } from './db.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT ?? 3000);
// On Amvera DATA_DIR is /data (the persistent mount); locally it defaults to ./data at the repo root.
const dataDir = process.env.DATA_DIR ?? resolve(here, '../../data');
const staticDir = process.env.STATIC_DIR ?? resolve(here, '../../apps/game/dist');
const protoDir = process.env.PROTO_DIR ?? resolve(here, '../../prototypes/dist');

// Moderation of the box of undelivered letters is enabled only when ADMIN_TOKEN is set (in Amvera: project variables).
const adminToken = process.env.ADMIN_TOKEN || undefined;
const app = await buildApp({ store: openStore(dataDir), staticDir, protoDir, adminToken, logger: true });
await app.listen({ port, host: '0.0.0.0' });
