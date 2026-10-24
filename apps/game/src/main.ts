/**
 * Milestone 0: the first screen and the lineup. Content warning and sound → lights on → the general's speech
 * typed under a pristine ROSTA poster → roll call → the player's name in the register.
 */
import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/pt-mono/400.css';
import '@fontsource/rubik-mono-one/400.css';
import '@fontsource/bad-script/400.css';
import './style.css';
import { Graphics } from 'pixi.js';
import { LINE, PLAYER } from './content/recruits.ts';
import { SPEECH } from './content/speech.ts';
import { makeBattle } from './core/battle.ts';
import { checkName } from './core/names.ts';
import { fetchRegister, reportArrival } from './net/api.ts';
import { loadSave, newRun, setSaveReadOnly, writeSave, type Gender, type KeyValue, type RunState, type SaveFile } from './core/save.ts';
import { loadSettings, onSettings, saveSettings, type Settings } from './core/settings.ts';
import { retireRun } from './core/save.ts';
import { installKeyRemap } from './engine/keys.ts';
import { installPause } from './ui/pause.ts';
import { AudioEngine } from './engine/audio.ts';
import { buildLineup, type LineupScene } from './render/lineup.ts';
import { MATTE, REF_H, REF_W } from './render/palette.ts';
import { RedGlasses } from './render/redGlasses.ts';
import { createStage, type Stage } from './render/stage.ts';
import { LINEUP_HOLES } from './render/tears.ts';
import { CaptionPlate, type Cue } from './ui/caption.ts';
import { BATTLES, type BattleId } from './content/battles.ts';
import { WORKSHOP_END, workshopLines } from './content/workshop.ts';
import { Runner } from './game/runner.ts';
import { battleRange, isBattleId } from './stages/battle/range.ts';
import { runBattle } from './stages/battle/run.ts';
import type { BattleContext } from './stages/battle/types.ts';
import { debugPanel } from './ui/debug.ts';
import { h, wait } from './ui/dom.ts';
import { showTakenOver, waitToTakeOver } from './ui/tabNotice.ts';
import { claimTab } from './core/tabs.ts';
import { isPhone, showDesktopOnly, showIntro } from './ui/intro.ts';
import { AgentBridge } from './agent/bridge.ts';
import { fewTextureUnits } from './agent/gpu.ts';
import { AGENT } from './agent/hooks.ts';
import { installVirtualTime } from './agent/virtualTime.ts';

// Agent mode (?agent): a virtual clock, so time moves only when the agent acts, and a seeded Math.random
// (?seed=), so a run replays the same. Installed before anything is built.
const agentTime = AGENT ? installVirtualTime(Number(new URLSearchParams(location.search).get('seed')) || 1) : null;
if (AGENT) fewTextureUnits();

/** Cut-out animation steps at 12 frames a second. */
const FRAME_MS = 1000 / 12;

function storage(): KeyValue | null {
  try {
    const s = window.localStorage;
    s.getItem('lda.probe');
    return s;
  } catch {
    return null;
  }
}

function applySettings(s: Settings): void {
  document.documentElement.classList.toggle('large-text', s.largeText);
}

/** Pixi draws text with whatever font is loaded at that moment, so the Cyrillic faces load first. */
async function fontsReady(): Promise<void> {
  if (!document.fonts) return;
  const faces: [string, string][] = [
    ['28px "Rubik Mono One"', 'ПОСТРОЕНИЕ СИЛА'],
    ['17px "PT Mono"', 'Смирно! Вольно.'],
    ['17px "PT Serif"', 'Генерал'],
    ['700 17px "PT Serif"', 'Короткий тёмный век'],
    ['22px "Bad Script"', 'Норкин'],
  ];
  await Promise.race([Promise.allSettled(faces.map(([f, t]) => document.fonts.load(f, t))), wait(3000)]);
}

function entryLine(run: RunState): string {
  return run.gender === 'f' ? `Прибыла рядовая ${run.name}.` : `Прибыл рядовой ${run.name}.`;
}

function rank(gender: Gender): string {
  return gender === 'f' ? 'Рядовая' : 'Рядовой';
}

function lightsOn(stage: Stage, dark: Graphics, audio: AudioEngine, reduced: boolean): Promise<void> {
  audio.click();
  if (reduced) {
    dark.alpha = 0;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const from = dark.alpha;
    // Wall-clock time: Pixi caps the ticker's delta on slow frames, which would stretch the fade.
    const start = performance.now();
    const fade = () => {
      dark.alpha = from * Math.max(0, 1 - (performance.now() - start) / 1400);
      if (dark.alpha <= 0) {
        stage.app.ticker.remove(fade);
        resolve();
      }
    };
    stage.app.ticker.add(fade);
  });
}

async function prologue(plate: CaptionPlate, scene: LineupScene, audio: AudioEngine, save: SaveFile, store: KeyValue | null): Promise<SaveFile> {
  const { general, recruits } = scene;
  general.setPose('speak');
  for (const [i, paragraph] of SPEECH.entries()) {
    const cues: Cue[] =
      i === 0
        ? [
            {
              at: 'Смирно!',
              run: () => {
                for (const r of recruits) r.setPose('attention');
                general.setPose('attention');
                audio.stomp(recruits.length);
              },
            },
            {
              at: 'Вольно.',
              run: () => {
                for (const r of recruits) r.setPose('rest');
                general.setPose('speak');
              },
            },
          ]
        : [];
    await plate.type(paragraph, cues);
  }
  general.setPose('rest');

  // Roll call, left to right; the player is fifth.
  let player: { name: string; gender: Gender } = { name: '', gender: 'm' };
  for (const [i, who] of LINE.entries()) {
    const r = recruits[i];
    if (!r) continue;
    r.setPose('speak');
    r.nudge(-10);
    if (who === PLAYER) {
      // The name given in the last finale's lineup starts this playthrough; otherwise the player gives one now.
      const given = save.memory.nextName;
      // A name given at the last finale's wall was counted there.
      if (given && checkName(given.name, save.memory.names).ok) player = given;
      else {
        player = await plate.askName(save.memory.names);
        void reportArrival();
      }
      await plate.callout(player.name);
    } else {
      await plate.callout(who);
    }
    r.nudge(10);
    r.setPose('rest');
  }

  general.setPose('speak');
  const run = newRun(player.name, player.gender);
  // Once, at the register: how the name goes on the triangles («Кому: …»).
  run.dative = await plate.askDative(run.dative);
  const next: SaveFile = { ...save, run, memory: { ...save.memory, nextName: null } };
  writeSave(store, next);
  await plate.register(next.memory.names, entryLine(run), true);
  general.setPose('rest');
  return next;
}

interface Barracks {
  stage: Stage;
  ui: HTMLElement;
  audio: AudioEngine;
  settings: Settings;
  reduced: boolean;
  plate: CaptionPlate;
  scene: LineupScene;
  glasses: RedGlasses;
  dark: Graphics;
  store: KeyValue | null;
  debug: boolean;
}

/**
 * The workshop: the general explains the battle, the light goes out, and the player coordinates Норкин for a
 * few training turns. A battle left half-way resumes where it was saved, without the explanation again.
 */
async function workshop(w: Barracks, save: SaveFile): Promise<void> {
  const run = save.run;
  if (!run) return;
  const { plate, scene, glasses, dark } = w;
  plate.header('2.', 'ВОРКШОП');
  if (!run.battle) {
    scene.general.setPose('speak');
    for (const line of workshopLines(`${rank(run.gender)} ${run.name}`)) await plate.type(line);
    scene.general.setPose('rest');
  }

  // The light goes out; the training battle runs in the tunnel.
  w.audio.click();
  plate.el.hidden = true;
  glasses.view.visible = false;
  dark.visible = false;
  const id: BattleId = 'training';
  const def = BATTLES[id];
  const saved = run.battle?.id === id ? run.battle : null;
  const ctx: BattleContext = {
    stage: w.stage,
    ui: w.ui,
    audio: w.audio,
    settings: w.settings,
    reduced: w.reduced,
    def,
    battle: saved?.state ?? makeBattle({ ...def.setup, seed: Math.floor(Math.random() * 1e9) }),
    memory: saved?.memory ?? { trust: run.trust.norkin ?? 1, partnerScared: false, playerScared: false, stats: {} },
    commit: () => {
      run.battle = { id, state: ctx.battle, memory: ctx.memory };
      writeSave(w.store, save);
    },
    debug: w.debug,
  };
  await runBattle(ctx);
  // Training costs no hits; what Норкин learned about the player stays.
  run.trust.norkin = ctx.memory.trust;
  run.battle = null;
  run.scene = 'amateur';
  writeSave(w.store, save);

  glasses.view.visible = true;
  dark.visible = true;
  dark.alpha = 0.93;
  await lightsOn(w.stage, dark, w.audio, w.reduced);
  plate.el.hidden = false;
  scene.general.setPose('speak');
  await plate.type(WORKSHOP_END);
  scene.general.setPose('rest');
}

async function main(): Promise<void> {
  const ui = document.getElementById('ui');
  const host = document.getElementById('stage');
  if (!ui || !host) return;
  if (agentTime) Reflect.set(window, 'ldaAgent', new AgentBridge(agentTime, ui));
  if (isPhone()) {
    showDesktopOnly(ui);
    return;
  }
  const store = storage();
  // An agent cannot hear or time anything: no timers, no motion or flashes, every sound written out.
  let settings = AGENT ? { ...loadSettings(store), reduceFlashes: true, noTimer: true, captions: true, keys: {} } : loadSettings(store);
  applySettings(settings);
  // The player's own keys (settings → «Клавиши»), read at every press.
  installKeyRemap(() => settings.keys);
  const reduced = AGENT || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  void navigator.storage?.persist?.().catch(() => undefined);
  // One playing tab: a second one waits to take over, and the one taken from stops writing.
  const tab = await claimTab(() => {
    setSaveReadOnly(true);
    showTakenOver(ui);
  });
  if (tab.busy) {
    await waitToTakeOver(ui);
    tab.take();
  }

  const audio = new AudioEngine();
  audio.setVolumes(settings.volume);
  // The settings panel changes the object in place; what the page itself shows follows at once.
  onSettings((s) => {
    applySettings(s);
    audio.setOutput(s.output);
    audio.setVolumes(s.volume);
  });
  const [stage] = await Promise.all([createStage(host), fontsReady()]);
  // An agent reads words, not pixels: the picture is drawn when it looks (or takes a screenshot), not every frame.
  const agent = Reflect.get(window, 'ldaAgent') as AgentBridge | undefined;
  if (agent) {
    stage.app.ticker.remove(stage.app.render, stage.app);
    agent.draw = () => stage.app.render();
  }

  // The firing range: one battle outside the story (?battle=training|b1|b2|b3).
  const range = params.get('battle');
  if (isBattleId(range)) {
    settings = await showIntro(ui, settings, false);
    if (!AGENT) {
      saveSettings(store, settings);
      audio.unlock(settings.output);
    }
    await battleRange(stage, ui, audio, settings, reduced, range, params);
    return;
  }

  const scene = buildLineup();
  const glasses = new RedGlasses(stage.app.renderer, scene.truth, scene.poster, LINEUP_HOLES, stage.app.renderer.resolution);
  stage.root.addChild(glasses.view);
  const dark = new Graphics().rect(0, 0, REF_W, REF_H).fill(MATTE);
  dark.alpha = 0.93;
  stage.root.addChild(dark);

  const plate = new CaptionPlate(ui, audio, reduced);
  plate.el.hidden = true;
  stage.onLayout((fit) => {
    glasses.setResolution(stage.app.renderer.resolution * fit.scale);
    plate.position(fit);
  });

  const t = Number(params.get('t'));
  if (Number.isFinite(t) && t > 0) glasses.setT(Math.min(1, t));
  if (params.has('debug')) debugPanel(ui, (v) => glasses.setT(v), glasses.point);

  let acc = 0;
  let frame = 0;
  stage.app.ticker.add((tk) => {
    acc += tk.deltaMS;
    while (acc >= FRAME_MS) {
      acc -= FRAME_MS;
      frame++;
      if (!reduced) scene.step(frame);
      // Poses change between frames too; baking at 12 fps catches them.
      glasses.invalidate();
    }
    // Hidden while a battle has the stage.
    if (glasses.view.visible) glasses.update();
  });

  let save = loadSave(store);
  // The shared register fills in on the first screen if the server answers; the game never waits for it.
  settings = await showIntro(ui, settings, save.run !== null, { data: fetchRegister(), veteran: save.memory.names.length > 0 });
  // In agent mode the page stays silent and leaves the player's own settings alone.
  if (!AGENT) {
    saveSettings(store, settings);
    audio.unlock(settings.output);
  }
  // Esc or P in the story: continue, settings, start again from the lineup. Battles, letters, duties and the
  // finale own Esc themselves: the pause opens only over the caption plate with nothing else open.
  installPause({
    ui,
    settings: () => settings,
    free: () => {
      if (plate.el.hidden || ui.querySelector('[aria-modal="true"], .applause, .chapter-card, .naming')) return false;
      const room = ui.querySelector<HTMLElement>('.bk');
      return !room || !room.hidden;
    },
    restart: () => {
      writeSave(store, retireRun(loadSave(store)));
      location.reload();
    },
  });
  await lightsOn(stage, dark, audio, reduced);

  plate.el.hidden = false;
  const debug = params.has('debug');
  // The opening plays on the lineup picture; a soldier already past it goes straight to the barracks.
  if (!save.run || save.run.scene === 'lineup' || save.run.scene === 'workshop') {
    plate.header('1.', 'ПОСТРОЕНИЕ');
    if (save.run) await plate.register(save.memory.names, entryLine(save.run), false);
    else save = await prologue(plate, scene, audio, save, store);
    if (save.run?.scene === 'workshop') await workshop({ stage, ui, audio, settings, reduced, plate, scene, glasses, dark, store, debug }, save);
  }
  if (!save.run) return;

  glasses.view.visible = false;
  dark.visible = false;
  // The runner writes the run into the register at the finale; the next playthrough starts at the lineup.
  await new Runner({ stage, ui, audio, settings, reduced, plate, store, debug }, save).play();
  location.reload();
}

void main();
