/** ?debug: a slider for «где в игре» (0 — prologue poster, 1 — final), to look at the tears without playing. */
import { h } from './dom.ts';

export function debugPanel(root: HTMLElement, onT: (t: number) => void, initial = 0): void {
  const range = h('input', { attrs: { type: 'range', min: '0', max: '1', step: '0.01', value: String(initial), id: 'debug-t' } });
  const out = h('output', { text: initial.toFixed(2), attrs: { for: 'debug-t' } });
  range.addEventListener('input', () => {
    const t = Number(range.value);
    out.textContent = t.toFixed(2);
    onT(t);
  });
  root.append(h('aside', { class: 'debug', attrs: { 'aria-label': 'Отладка' } }, h('label', { text: 'где в игре ', attrs: { for: 'debug-t' } }), range, out));
}
