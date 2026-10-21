import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const staticDir = process.env.STATIC_DIR ?? resolve(here, '../../apps/game/dist');

const app = await buildApp({ staticDir, logger: true });
await app.listen({ port, host: '0.0.0.0' });
