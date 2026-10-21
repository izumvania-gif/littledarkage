import { defineConfig } from 'vite';

export default defineConfig({
  // pixi.js is one ~500 kB chunk; fine for a desktop game.
  build: { chunkSizeWarningLimit: 1200 },
  server: {
    // During `npm run dev`, API calls go to the Fastify server (`npm run dev:server`).
    proxy: { '/api': 'http://localhost:3000' },
  },
});
