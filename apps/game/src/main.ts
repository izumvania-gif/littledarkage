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
import { loadSave, retireRun, writeSave, type Gender, type KeyValue, type RunState, type SaveFile } from './core/save.ts';
import { loadSettings, saveSettings, type Settings } from './core/settings.ts';
import { AudioEngine } from './engine/audio.ts';
import { buildLineup, type LineupScene } from './render/lineup.ts';
import { MATTE, REF_H, REF_W } from './render/palette.ts';
import { RedGlasses } from './render/redGlasses.ts';
import { createStage, type Stage } from './render/stage.ts';
import { LINEUP_HOLES } from './render/tears.ts';
import { CaptionPlate, type Cue } from './ui/caption.ts';
import { battleRange, isBattleId } from './stages/battle/range.ts';
import { debugPanel } from './ui/debug.ts';
import { wait } from './ui/dom.ts';
import { isPhone, showDesktopOnly, showIntro } from './ui/intro.ts';

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
      player = await plate.askName(save.memory.names);
      await plate.callout(player.name);
    } else {
      await plate.callout(who);
    }
    r.nudge(10);
    r.setPose('rest');
  }

  general.setPose('speak');
  const run: RunState = { name: player.name, gender: player.gender, stage: 'registered' };
  const next: SaveFile = { ...save, run };
  writeSave(store, next);
  await plate.register(next.memory.names, entryLine(run), true);
  general.setPose('rest');
  return next;
}

async function main(): Promise<void> {
  const ui = document.getElementById('ui');
  const host = document.getElementById('stage');
  if (!ui || !host) return;
  if (isPhone()) {
    showDesktopOnly(ui);
    return;
  }
  const store = storage();
  let settings = loadSettings(store);
  applySettings(settings);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  void navigator.storage?.persist?.().catch(() => undefined);

  const audio = new AudioEngine();
  const [stage] = await Promise.all([createStage(host), fontsReady()]);

  // The firing range: one battle outside the story (?battle=training|b1|b2|b3).
  const range = params.get('battle');
  if (isBattleId(range)) {
    settings = await showIntro(ui, settings, false);
    saveSettings(store, settings);
    audio.unlock(settings.output);
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
    glasses.update();
  });

  let save = loadSave(store);
  settings = await showIntro(ui, settings, save.run !== null);
  saveSettings(store, settings);
  audio.unlock(settings.output);
  await lightsOn(stage, dark, audio, reduced);

  plate.el.hidden = false;
  plate.header('1.', 'ПОСТРОЕНИЕ');
  if (save.run) await plate.register(save.memory.names, entryLine(save.run), false);
  else save = await prologue(plate, scene, audio, save, store);

  const run = save.run;
  if (!run) return;
  await plate.end(
    `${rank(run.gender)} ${run.name} в строю. Дальше будут воркшоп, встреча Крыпоткина и первый цикл: это следующие вехи.`,
    `${rank(run.gender)} ${run.name} уйдёт в книгу учёта зачёркнутым, и взять это имя снова будет нельзя.`,
  );
  writeSave(store, retireRun(save));
  location.reload();
}

void main();
