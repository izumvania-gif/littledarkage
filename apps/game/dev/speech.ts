/**
 * Dev page for the new general's speech (not part of the build): put it together from the slips before the
 * lineup, the old general's prompts printed into a stand-in caption plate. http://localhost:5173/dev/speech.html
 * (`?go=1` starts at once, `?untimed=1` without the clock).
 */
import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/pt-mono/400.css';
import '@fontsource/rubik-mono-one/400.css';
import '@fontsource/bad-script/400.css';
import '../src/style.css';
import { SPEECH_FRAGMENTS } from '../src/content/speechFragments.ts';
import { DEFAULT_SETTINGS } from '../src/core/settings.ts';
import { AudioEngine } from '../src/engine/audio.ts';
import { CAPTION_TOP, REF_H, REF_W } from '../src/render/palette.ts';
import { createStage } from '../src/render/stage.ts';
import type { DutyContext } from '../src/stages/duty/types.ts';
import { runSpeechAssembly } from '../src/stages/speech/SpeechAssembly.ts';
import { h } from '../src/ui/dom.ts';

const params = new URLSearchParams(location.search);
const ui = document.getElementById('ui')!;
const host = document.getElementById('stage')!;
await document.fonts?.load('30px "Rubik Mono One"', 'РЕЧЬ');
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
const out = h('pre', { attrs: { id: 'result', style: 'margin:0;white-space:pre-wrap' } });
const panel = h(
  'div',
  { attrs: { id: 'dev-panel', style: 'position:fixed;top:8px;right:8px;z-index:9;display:grid;gap:6px;padding:10px;background:#1c1a18;color:#eadfc6;font:14px "PT Mono",monospace;max-width:320px' } },
  h('label', {}, untimed, ' без таймера'),
);
ui.append(panel);

async function go(t: number): Promise<void> {
  audio.unlock('headphones');
  panel.hidden = true;
  const ctx: DutyContext = { stage, ui, audio, settings: { ...DEFAULT_SETTINGS, noTimer: untimed.checked }, reduced: false, t, say };
  const result = await runSpeechAssembly(ctx, { fragments: SPEECH_FRAGMENTS });
  panel.hidden = false;
  out.textContent = JSON.stringify(result, null, 1);
  plate.replaceChildren();
}

const b = h('button', { text: 'Речь, t = 0.72', attrs: { type: 'button', 'data-run': 'speech' } });
b.addEventListener('click', () => void go(0.72));
panel.append(b, out);
if (params.get('go') === '1') void go(Number(params.get('t')) || 0.72);
