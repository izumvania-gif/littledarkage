import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const page = (dir: string) => resolve(import.meta.dirname, dir, 'index.html');

/** Throwaway prototypes of milestone 1, served by the game server under /proto/. Never imported by apps/game. */
export default defineConfig({
  base: '/proto/',
  server: { port: 5174 },
  build: {
    rolldownOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        coordinator: page('coordinator'),
        striker: page('striker'),
        brawl: page('brawl'),
      },
    },
  },
});
