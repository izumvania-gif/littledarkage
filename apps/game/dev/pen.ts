/**
 * Dev page for the pen duty (not part of the build): take the pen apart and put it together, with eyes open or
 * blindfolded, the general's lines printed into a stand-in caption plate. http://localhost:5173/dev/pen.html
 * (`?blind=1` starts blindfolded at once, `?untimed=1` without the stopwatch's limit).
 */
import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/pt-mono/400.css';
import '@fontsource/rubik-mono-one/400.css';
import '@fontsource/bad-script/400.css';
import '../src/style.css';
import { DEFAULT_SETTINGS } from '../src/core/settings.ts';
import { AudioEngine } from '../src/engine/audio.ts';
import { CAPTION_TOP, REF_H, REF_W } from '../src/render/palette.ts';
import { createStage } from '../src/render/stage.ts';
import { runPen } from '../src/stages/duty/PenDuty.ts';
import type { DutyContext } from '../src/stages/duty/types.ts';
import { h } from '../src/ui/dom.ts';

const params = new URLSearchParams(location.search);
const ui = document.getElementById('ui')!;
const host = document.getElementById('stage')!;
await document.fonts?.load('30px "Rubik Mono One"', 'РАЗОБРАЛ СОБЕРИ');
const stage = await createStage(host);
const audio = new AudioEngine();

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
const say: DutyContext['say'] = (text, opts) => {
  plate.replaceChildren(h('p', { class: 'speaker', text: opts?.speaker ?? 'Генерал' }), h('p', { class: 'typed done', text }));
  return new Promise((resolve) => {
    if (opts?.timeoutMs !== undefined) {
      setTimeout(resolve, opts.timeoutMs);
      return;
    }
    const done = () => {
      window.removeEventListener('keydown', key);
      plate.removeEventListener('click', done);
      resolve();
    };
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') done();
    };
    window.addEventListener('keydown', key);
    plate.addEventListener('click', done);
  });
};

const untimed = h('input', { attrs: { type: 'checkbox', id: 'untimed' } });
untimed.checked = params.get('untimed') === '1';
const calm = h('input', { attrs: { type: 'checkbox', id: 'calm' } });
const out = h('pre', { attrs: { id: 'result', style: 'margin:0;white-space:pre-wrap' } });
const panel = h(
  'div',
  { attrs: { id: 'dev-panel', style: 'position:fixed;top:8px;right:8px;z-index:9;display:grid;gap:6px;padding:10px;background:#1c1a18;color:#eadfc6;font:14px "PT Mono",monospace;max-width:280px' } },
  h('label', {}, untimed, ' без таймера'),
  h('label', {}, calm, ' без вспышек'),
);
ui.append(panel);

async function go(blind: boolean, t: number): Promise<void> {
  audio.unlock('headphones');
  panel.hidden = true;
  const ctx: DutyContext = { stage, ui, audio, settings: { ...DEFAULT_SETTINGS, noTimer: untimed.checked, reduceFlashes: calm.checked }, reduced: false, t, say };
  const result = await runPen(ctx, { blind });
  panel.hidden = false;
  out.textContent = JSON.stringify(result, null, 1);
  plate.replaceChildren();
}

for (const [label, blind, t] of [
  ['Ручка, t = 0.2', false, 0.2],
  ['Ручка вслепую, t = 0.4', true, 0.4],
] as const) {
  const b = h('button', { text: label, attrs: { type: 'button', 'data-run': blind ? 'blind' : 'sighted' } });
  b.addEventListener('click', () => void go(blind, t));
  panel.append(b);
}
panel.append(out);
if (params.has('blind')) void go(params.get('blind') === '1', params.get('blind') === '1' ? 0.4 : 0.2);
