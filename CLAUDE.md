# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

«Короткий тёмный век» (Little Dark Age) — a single-player desktop browser game in Russian, adapted from a live-action role-play: rat soldiers fight creatures blind in striker/coordinator pairs, rest in the barracks between alarms, and meet the philosopher Krypotkin. The full design lives in `docs/concept.md` (Russian); read it before adding gameplay, story, visuals or sound. Source documents of the role-play and the letters from home are in `docs/source/`. Rules from the concept that the code must keep:
- The game judges people, not ideology. Soviet imagery is texture; Krypotkin is an ordinary man with his own flaws (after Kropotkin, not Lenin).
- The creatures stay incomprehensible: hooks toward several readings, never an answer.
- All art is drawn in code (Pixi Graphics, canvas textures). No generated images, no bitmap assets other than fonts.
- Desktop only, 60–90 minutes, no voices yet; the online layer is postponed (no database).

## Commands

Run from the repo root (npm workspaces: `apps/game`, `server`; Node >= 22.13).

- `npm ci` — install
- `npm run dev` + `npm run dev:server` — Vite client on :5173 (proxies `/api` to :3000) and Fastify server on :3000
- `npm run typecheck` / `npm test` / `npm run build`
- `npm start` — serve the built client from the compiled server (`PORT`, `STATIC_DIR` env vars)
- Single test file: `cd apps/game && node --experimental-strip-types --test test/save.test.ts` (same pattern in `server/`)
- `?debug` shows a slider for t («где в игре», 0..1); `?t=0.55` opens the scene at that t; `?desktop` skips the phone check.

## Architecture

Client (`apps/game`, Vite + TypeScript + PixiJS 8, no UI framework — DOM via `ui/dom.ts`):
- `main.ts` runs the flow: intro (content warning, sound output) → lights on → «1. ПОСТРОЕНИЕ» → the general's speech typed on the caption plate → roll call, where the player gives a name and рядовой/рядовая → entry in the register → end card. A returning player sees the register instead of the speech.
- «Красные очки» (`render/redGlasses.ts`): a ROSTA poster layer over a perekladka («truth») layer, both built from the same cutouts (`render/lineup.ts`, `PuppetPair`). The poster is baked into a RenderTexture; tears (`render/tears.ts`) are drawn as a cream rim plus an `erase` fill, with a blurred shadow below. One parameter t (0 = pristine poster, 1 = poster gone) drives everything. Rebake only when dirty (t change, a puppet step, resize), never every frame.
- The scene is laid out in a 1280×720 reference frame, letterboxed (`render/stage.ts`, `Fit`). Colors live in `render/palette.ts`. The caption band starts at `CAPTION_TOP`, and the DOM caption plate (`ui/caption.ts`) sits exactly over it.
- All meaningful text is DOM on flat plates with contrast ≥ 4.5:1, never text drawn in the canvas (the poster slogan is decoration). Keys are bound by `KeyboardEvent.code`. Space or Enter advances, and a click skips typing.
- Puppets (`render/puppet.ts`) are jointed cutouts on pins that step at 12 fps (stop-motion), not tweened.
- `core/save.ts` — one localStorage key `lda.save` (plus `lda.save.bak`, written before every save, and a generation counter) with two layers: `run` (this playthrough) and `memory` (survives restarts: crossed-out names, which the roll call refuses). Bump `SAVE_SCHEMA` and add a migration when `SaveFile` changes shape. Settings are separate (`core/settings.ts`, `lda.settings`): output (headphones/speakers/mono), large text, no flashes.
- `engine/audio.ts` — Web Audio synthesis only (typewriter, bell, stomp, lamp click, room tone) on sfx/ui/ambience buses; it unlocks on the first click and suspends on a hidden tab.
- `content/speech.ts` must match the quoted lines of «Речь генерала» in `docs/concept.md` word for word (`test/speech.test.ts`). Change the concept first.
- TypeScript runs with `erasableSyntaxOnly`: no parameter properties, enums or namespaces; imports carry the `.ts` extension.

Server (`server`): Fastify app built in `src/app.ts`. It has `/api/health` and serves `apps/game/dist` with an SPA fallback; other `/api/*` paths return a JSON 404. No database until the online layer.

## External skills

As in Eferon, the visual and UI work follows external rule sets, cloned to a temp folder and read as guides (not installed): [taste-skill](https://github.com/Leonxlnx/taste-skill) (`design-taste-frontend`) and [awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) (`game-ui-ux`, `audio-design`, `web-engines/pixijs-rendering`, then `game-feel`, `game-ai`, `input-systems`, `save-systems` as needed). From taste-skill take only contrast, hierarchy, text plates and focus. Its rules against monospace, cream with rust red, small spaced capitals and more than two typefaces are excluded: that is the game's style. [brag](https://github.com/latent-spaces/brag) is for the trailer.

## Deploy

Pushes to `main` run `.github/workflows/ci.yml` (typecheck, tests, build, Docker build + smoke test). Amvera builds the root `Dockerfile` per `amvera.yml` (docker environment, port 3000, the `/data` mount reserved for the online layer) and deploys on the GitHub "Workflow runs" trigger, so only green CI deploys. The Dockerfile copies `apps/game` and `server` explicitly; add new top-level source dirs (`story/`) there.
