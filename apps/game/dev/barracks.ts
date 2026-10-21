/**
 * Dev page for the barracks (not shipped: the build only takes index.html). Everyone in the room, t, lights,
 * arrangements, a pose cycler and a roam test. Query: ?t=0.3&light=disco&arr=concert|lineup|all|roam.
 */
import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/pt-mono/400.css';
import '@fontsource/rubik-mono-one/400.css';
import '@fontsource/bad-script/400.css';
import '../src/style.css';
import { DEFAULT_SETTINGS } from '../src/core/settings.ts';
import { LOOKS } from '../src/content/looks.ts';
import { PLAYER_ID } from '../src/content/soldiers.ts';
import { AudioEngine } from '../src/engine/audio.ts';
import { createStage } from '../src/render/stage.ts';
import { BarracksStage, type BPose, type Light } from '../src/stages/barracks/BarracksStage.ts';
import { h, wait } from '../src/ui/dom.ts';

const params = new URLSearchParams(location.search);
const ui = document.getElementById('ui')!;
const host = document.getElementById('stage')!;

async function fonts(): Promise<void> {
  const faces = ['20px "Rubik Mono One"', '17px "PT Serif"', '700 17px "PT Serif"', '17px "PT Mono"', '20px "Bad Script"'];
  await Promise.race([Promise.allSettled(faces.map((f) => document.fonts.load(f, 'СИЛА — В СПЛОЧЁННОСТИ САНЧАСТЬ'))), wait(3000)]);
}

const stage = await createStage(host);
await fonts();
const audio = new AudioEngine();
const reduced = params.has('reduced');
const settings = { ...DEFAULT_SETTINGS, reduceFlashes: params.has('calm') };
const bk = new BarracksStage(stage, ui, audio, settings, reduced);
const everyone = Object.keys(LOOKS);
(window as unknown as { bk: BarracksStage }).bk = bk;

const BAND = ['kroshkin', 'cherdakov', 'zernov'];

function all(): void {
  bk.show(everyone);
  const spots = ['desk', 'line1', 'line2', 'line3', 'line4', 'line5', 'line6', 'line7', 'line8', 'line9', 'mailbox', 'sickbay'];
  everyone.forEach((id, i) => bk.place(id, spots[i] ?? 640, { facing: id === 'general' ? 'right' : 'left' }));
}

function concert(): void {
  bk.show(everyone);
  BAND.forEach((id, i) => bk.place(id, `stage${i + 1}`, { pose: 'play' }));
  const audience = everyone.filter((id) => !BAND.includes(id) && id !== 'general');
  const seats = ['bench1', 'bench2', 'bench3', 'bench4', 'bench5', 'bench6', 'bunk1', 'bunk5', 'bunk3'];
  audience.forEach((id, i) => bk.place(id, seats[i] ?? 'center'));
  bk.place('general', 'desk');
}

function lineup(): void {
  bk.show(everyone.filter((id) => !BAND.includes(id)));
  bk.place('general', 'desk', { pose: 'speak' });
  everyone.filter((id) => id !== 'general' && !BAND.includes(id)).forEach((id, i) => bk.place(id, `line${i + 1}`, { pose: 'attention' }));
}

function roam(): void {
  bk.show(['general', 'norkin', 'syrkov', 'krypotkin', 'sedoy', PLAYER_ID]);
  bk.place('general', 'desk');
  bk.place('norkin', 'bench2');
  bk.place('syrkov', 'bunk1');
  bk.place('krypotkin', 'poster');
  bk.place('sedoy', 'bunk5');
  bk.place(PLAYER_ID, 'center');
  void bk
    .roam([
      { id: 'norkin', label: 'Норкин', at: 'norkin' },
      { id: 'tape', label: 'Магнитофон', at: 'tape' },
      { id: 'mail', label: 'Почтовый ящик', at: 'mailbox' },
      { id: 'sick', label: 'Санчасть', at: 'sickbay' },
      { id: 'kr', label: 'Крыпоткин', at: 'krypotkin' },
    ])
    .then((id) => {
      log.textContent = `выбрано: ${id}`;
    });
}

const ARR: Record<string, () => void> = { all, concert, lineup, roam };
const log = h('p', { class: 'dev-log' });
const t = h('input', { attrs: { type: 'range', min: '0', max: '1', step: '0.01', value: params.get('t') ?? '0' } });
t.addEventListener('input', () => bk.setT(Number(t.value)));
const lights = (['warm', 'disco', 'dark', 'alarm'] as Light[]).map((l) => {
  const b = h('button', { text: l, attrs: { type: 'button' } });
  b.addEventListener('click', () => bk.setLight(l));
  return b;
});
const arrs = Object.keys(ARR).map((a) => {
  const b = h('button', { text: a, attrs: { type: 'button' } });
  b.addEventListener('click', () => ARR[a]?.());
  return b;
});
const who = h('select', {}, ...everyone.map((id) => h('option', { text: id, attrs: { value: id } })));
const poses: BPose[] = ['rest', 'attention', 'speak', 'walk', 'sit', 'carry', 'clap', 'play', 'point'];
const poseBtns = poses.map((p) => {
  const b = h('button', { text: p, attrs: { type: 'button' } });
  b.addEventListener('click', () => bk.pose(who.value, p));
  return b;
});
const walkBtn = h('button', { text: 'walk→tape', attrs: { type: 'button' } });
walkBtn.addEventListener('click', () => void bk.walk(who.value, 'tape'));
const talkBtn = h('button', { text: 'speaking', attrs: { type: 'button' } });
talkBtn.addEventListener('click', () => bk.speaking(who.value));
const panel = h('div', { class: 'dev-panel' }, h('label', {}, 't ', t), ...lights, ' | ', ...arrs, ' | ', who, ...poseBtns, walkBtn, talkBtn, log);
if (!params.has('clean')) ui.append(panel);
const style = document.createElement('style');
style.textContent = `.dev-panel{position:fixed;left:8px;right:8px;bottom:8px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:6px;background:#0f0e0d;color:#eadfc6;font:12px var(--mono)}.dev-panel button,.dev-panel select{font:12px var(--mono)}.dev-log{margin:0 0 0 8px}`;
document.head.append(style);

bk.setT(Number(params.get('t') ?? 0));
(ARR[params.get('arr') ?? 'all'] ?? all)();
const light = params.get('light') as Light | null;
if (light) bk.setLight(light);
