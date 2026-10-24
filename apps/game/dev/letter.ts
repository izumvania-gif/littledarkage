/** Dev page for the letters (not part of the build): open each kind of letter and log the result. */
import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/pt-mono/400.css';
import '@fontsource/bad-script/400.css';
import '../src/style.css';
import { openLetter, showLetter } from '../src/ui/letter.ts';
import { h } from '../src/ui/dom.ts';

const ui = document.getElementById('ui')!;
const reduced = new URLSearchParams(location.search).has('reduced');
const log = h('pre', { attrs: { id: 'log', style: 'margin:0;color:#eadfc6;font:14px monospace' } });
const panel = h('div', { attrs: { style: 'position:absolute;top:16px;left:16px;display:grid;gap:8px;max-width:340px' } });
const add = (label: string, run: () => Promise<unknown>) => {
  const b = h('button', { class: 'secondary', text: label, attrs: { type: 'button', style: 'color:#eadfc6;border-color:#eadfc6' } });
  b.addEventListener('click', async () => {
    const r = await run();
    log.textContent = `${label}: ${JSON.stringify(r ?? 'closed')}`;
  });
  panel.append(b);
};
add('9 — рядовой', () => openLetter(ui, 9, { gender: 'm', dative: 'Петрову', reduced, canReply: true }));
add('9 — рядовая', () => openLetter(ui, 9, { gender: 'f', dative: 'Петровой', reduced, canReply: true }));
add('7 — рядовая', () => openLetter(ui, 7, { gender: 'f', dative: 'Петровой', reduced, canReply: true }));
add('14 — читает Норкин', () => showLetter(ui, 14, { reduced, reader: 'norkin' }));
add('6 — детское', () => showLetter(ui, 6, { reduced }));
add('13 — патриоты', () => showLetter(ui, 13, { reduced, reader: 'podvalny' }));
panel.append(log);
ui.append(panel);
