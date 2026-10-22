/**
 * Dev page for the mutiny brawl (not part of the build): choose who stands where, play it, read the result.
 * The general's lines go to a stand-in caption plate; the tape recorder plays the band's «riot» track.
 * «Робот» lets the autopilot (stages/mutiny/autopilot.ts) fight for the player, for screenshots and the Playwright check.
 * http://localhost:5173/dev/mutiny.html (?allies=norkin,korochkina&waverers=zernov&loyal=syrkov,khvostov&krypotkin=1&auto=1&go=1)
 */
import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/pt-mono/400.css';
import '@fontsource/rubik-mono-one/400.css';
import '@fontsource/bad-script/400.css';
import '../src/style.css';
import { DEFAULT_SETTINGS } from '../src/core/settings.ts';
import { AudioEngine } from '../src/engine/audio.ts';
import { Music } from '../src/engine/music.ts';
import { CAPTION_TOP, REF_H, REF_W } from '../src/render/palette.ts';
import { createStage } from '../src/render/stage.ts';
import { runMutiny } from '../src/stages/mutiny/MutinyStage.ts';
import type { MutinyContext } from '../src/stages/mutiny/types.ts';
import { h } from '../src/ui/dom.ts';

const ui = document.getElementById('ui')!;
const host = document.getElementById('stage')!;
await document.fonts?.load('30px "Rubik Mono One"', 'ДОЛОЙ БУНТ');
const stage = await createStage(host);
const audio = new AudioEngine();
const music = new Music(audio);
const q = new URLSearchParams(location.search);

// A stand-in for the caption plate: the line appears at once; a timed one goes by itself, others wait for a key.
const plate = h('section', { class: 'caption', attrs: { id: 'dev-plate' } });
ui.append(plate);
stage.onLayout((fit) => {
  const s = plate.style;
  s.setProperty('--u', `${fit.scale}px`);
  s.left = `${fit.x}px`;
  s.width = `${REF_W * fit.scale}px`;
  s.bottom = `${window.innerHeight - (fit.y + REF_H * fit.scale)}px`;
  s.minHeight = `${(REF_H - CAPTION_TOP) * fit.scale}px`;
});
const say: MutinyContext['say'] = (text, opts) => {
  plate.replaceChildren(h('p', { class: 'speaker', text: opts?.speaker ?? 'Генерал' }), h('p', { class: 'typed done', text }));
  return new Promise((resolve) => {
    if (opts?.timeoutMs !== undefined) {
      setTimeout(resolve, opts.timeoutMs);
      return;
    }
    const done = () => {
      window.removeEventListener('keydown', key);
      resolve();
    };
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') done();
    };
    window.addEventListener('keydown', key);
  });
};

const field = (id: string, value: string) => h('input', { attrs: { id, value, size: '28' } });
const box = (id: string, on: boolean) => {
  const el = h('input', { attrs: { type: 'checkbox', id } });
  el.checked = on;
  return el;
};
const allies = field('allies', q.get('allies') ?? 'norkin,korochkina');
const waverers = field('waverers', q.get('waverers') ?? 'zernov');
const loyal = field('loyal', q.get('loyal') ?? 'syrkov,khvostov,kroshkin,cherdakov,podvalny,sedoy');
const krypotkin = box('krypotkin', q.get('krypotkin') !== '0');
const fem = box('fem', q.get('fem') === '1');
const calm = box('calm', q.get('calm') === '1');
const untimed = box('untimed', q.get('untimed') === '1');
const auto = box('auto', q.get('auto') === '1');
const out = h('pre', { attrs: { id: 'result', style: 'margin:0;white-space:pre-wrap;max-height:40vh;overflow:auto' } });
const panel = h(
  'div',
  { attrs: { id: 'dev-panel', style: 'position:fixed;top:8px;right:8px;z-index:9;display:grid;gap:6px;padding:10px;background:#1c1a18;color:#eadfc6;font:13px "PT Mono",monospace;max-width:320px' } },
  h('label', {}, 'с игроком ', allies),
  h('label', {}, 'колеблются ', waverers),
  h('label', {}, 'с генералом ', loyal),
  h('label', {}, krypotkin, ' Крыпоткин в казарме'),
  h('label', {}, fem, ' рядовая'),
  h('label', {}, calm, ' без вспышек'),
  h('label', {}, untimed, ' без таймера (без спешки сразу)'),
  h('label', {}, auto, ' робот дерётся за игрока'),
);
ui.append(panel);

const list = (el: HTMLInputElement) => el.value.split(',').map((s) => s.trim()).filter(Boolean);
const NAMES: Record<string, string> = { general: 'Генерал', norkin: 'Норкин', korochkina: 'Корочкина', podvalny: 'Подвальный', syrkov: 'Пышкин', sedoy: 'Седой', khvostov: 'Хвостов', kroshkin: 'Крошкин', cherdakov: 'Чердаков', zernov: 'Зернов', krypotkin: 'Крыпоткин' };

async function go(): Promise<void> {
  audio.unlock('headphones');
  panel.hidden = true;
  Reflect.set(window, '__mutinyAuto', auto.checked);
  const result = await runMutiny({
    stage,
    ui,
    audio,
    settings: { ...DEFAULT_SETTINGS, reduceFlashes: calm.checked, noTimer: untimed.checked },
    reduced: false,
    allies: list(allies),
    waverers: list(waverers),
    loyal: list(loyal),
    krypotkin: krypotkin.checked,
    names: NAMES,
    player: { name: 'Иванова', fem: fem.checked },
    say,
    tape: (on) => void (on ? music.play('riot', { loop: true }) : music.stop()),
  });
  panel.hidden = false;
  out.textContent = JSON.stringify(result, null, 1);
  Reflect.set(window, '__mutinyResult', result);
  plate.replaceChildren();
}

const run = h('button', { text: 'Бунт', attrs: { type: 'button', 'data-run': 'mutiny' } });
run.addEventListener('click', () => void go());
panel.append(run, out);
if (q.get('go') === '1') void go();
