/**
 * Dev page for the finale (not part of the build): plays one ending with a made-up run behind it.
 * http://localhost:5173/dev/finale.html?ending=lineup|newGeneral|emptyWall (&fem, &noreplies, &calm, &reduced)
 */
import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/pt-mono/400.css';
import '@fontsource/rubik-mono-one/400.css';
import '@fontsource/bad-script/400.css';
import '../src/style.css';
import { DEFAULT_SETTINGS } from '../src/core/settings.ts';
import { AudioEngine } from '../src/engine/audio.ts';
import { createStage } from '../src/render/stage.ts';
import { runFinale, type Ending, type FinaleContext } from '../src/stages/finale/FinaleStage.ts';
import { h } from '../src/ui/dom.ts';

const params = new URLSearchParams(location.search);
const ending: Ending = params.get('ending') === 'newGeneral' ? 'newGeneral' : params.get('ending') === 'emptyWall' ? 'emptyWall' : 'lineup';
const fem = params.has('fem');
const ui = document.getElementById('ui')!;
const host = document.getElementById('stage')!;
await document.fonts?.load('30px "Rubik Mono One"', 'КОРОТКИЙ ТЁМНЫЙ ВЕК');
const stage = await createStage(host);
const audio = new AudioEngine();

const replies = params.has('noreplies')
  ? []
  : [
      { n: 9, text: 'Звание у меня никакое, рядовой. Кормят нормально. Норкин свистит, когда страшно, и я теперь тоже.' },
      { n: 7, text: 'Я писал. Каждый чилл писал. Не знаю, куда они деваются.\n\nПередай маме, что у меня всё хорошо.' },
    ];

const ctx: FinaleContext = {
  stage,
  ui,
  audio,
  settings: { ...DEFAULT_SETTINGS, reduceFlashes: params.has('calm') },
  reduced: params.has('reduced'),
  ending,
  replies,
  player: { name: 'Сидоров', fem },
  recruits: ending === 'emptyWall' ? [] : ['Норушкин', 'Корюшкина', 'Пышкин', 'Погребов', 'Хвостиков', 'Зёрнышкин'],
  taken: ['Иванов', 'Петрова'],
  register: [
    { name: 'Иванов', note: 'выбыл', crossed: true },
    { name: 'Петрова', note: 'пала смертью храбрых; прикрыла Норкина', crossed: true },
    { name: 'Норкин', note: 'выбыл', crossed: false },
    { name: 'Сырков', note: 'выбыл в первом бою', crossed: false },
    { name: 'Крыпоткин', note: 'пал смертью храбрых', crossed: false },
    { name: 'Кузнецов', note: 'ходил в разведку; выбыл', crossed: false },
    { name: 'Сидоров', note: 'взял тварь живой; поднял бунт', crossed: false },
  ],
  formerNames: ['Кузнецов', 'Сидоров'],
};

const out = h('pre', { attrs: { id: 'result', style: 'position:fixed;top:8px;left:8px;z-index:99;margin:0;padding:8px;background:#1c1a18;color:#eadfc6;font:14px "PT Mono",monospace' } });
const start = h('button', { text: `Финал: ${ending}`, attrs: { id: 'start', type: 'button', style: 'position:fixed;top:40%;left:50%;transform:translateX(-50%);z-index:99;font:20px "PT Mono",monospace;padding:12px 20px' } });
ui.append(start);
start.addEventListener('click', async () => {
  audio.unlock('headphones');
  start.remove();
  const result = await runFinale(ctx);
  out.textContent = JSON.stringify(result);
  document.body.dataset.done = '1';
  ui.append(out);
});
start.focus();
