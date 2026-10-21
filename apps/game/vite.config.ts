import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { compileInkFile } from './tools/ink.ts';

/** Lets the client `import storyJson from '…/main.ink'`; the INCLUDEd files beside it trigger HMR too (as in Eferon). */
function ink(): Plugin {
  return {
    name: 'lda-ink',
    load(id) {
      if (!id.endsWith('.ink')) return null;
      const { json, warnings } = compileInkFile(id);
      for (const w of warnings) this.warn(w);
      const dir = dirname(id);
      for (const f of readdirSync(dir)) if (f.endsWith('.ink')) this.addWatchFile(resolve(dir, f));
      return `export default ${JSON.stringify(json)};`;
    },
    handleHotUpdate({ file, server }) {
      if (!file.endsWith('.ink')) return;
      // Drop the compiled story from the cache, or the reload would serve the old one.
      for (const mod of server.moduleGraph.idToModuleMap.values()) if (mod.id?.endsWith('.ink')) server.moduleGraph.invalidateModule(mod);
      server.ws.send({ type: 'full-reload' });
      return [];
    },
  };
}

export default defineConfig({
  plugins: [ink()],
  // pixi.js + inkjs are one ~700 kB chunk; fine for a desktop game.
  build: { chunkSizeWarningLimit: 1200 },
  server: {
    // During `npm run dev`, API calls go to the Fastify server (`npm run dev:server`).
    proxy: { '/api': 'http://localhost:3000' },
    // The script lives in story/ at the repo root.
    fs: { allow: ['../..'] },
  },
});
