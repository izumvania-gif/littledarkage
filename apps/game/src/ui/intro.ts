/**
 * The first screen: content warning, how the player listens, and one button. The click is also what lets the
 * browser start sound, so nothing plays before it.
 */
import type { Output, Settings } from '../core/settings.ts';
import type { RegisterResponse } from '../net/api.ts';
import { arrivedLine, pickStats } from '../net/stats.ts';
import { h } from './dom.ts';

const OUTPUTS: { value: Output; label: string }[] = [
  { value: 'headphones', label: 'Наушники' },
  { value: 'speakers', label: 'Колонки' },
  { value: 'mono', label: 'Моно или одно ухо' },
];

/**
 * `register`, when given, is the shared register on its way from the server: the count of recruits and a line
 * of what the other barracks did fill in when (and if) it arrives; offline the screen simply has no such lines.
 */
export function showIntro(root: HTMLElement, settings: Settings, returning: boolean, register?: { data: Promise<RegisterResponse | null>; veteran: boolean }): Promise<Settings> {
  return new Promise((resolve) => {
    const book = h('div', { class: 'register-line', attrs: { 'aria-live': 'polite' } });
    void register?.data.then((r) => {
      if (!r || !book.isConnected) return;
      book.append(h('p', { class: 'arrived', text: arrivedLine(r.arrived) }), ...pickStats(r, register.veteran, Math.random).map((line) => h('p', { class: 'stat', text: line })));
    });
    const radios = OUTPUTS.map(({ value, label }) => {
      const input = h('input', { attrs: { type: 'radio', name: 'output', value, id: `output-${value}` } });
      input.checked = settings.output === value;
      return h('label', { class: 'seg-option', attrs: { for: `output-${value}` } }, input, h('span', { text: label }));
    });
    const button = h('button', { class: 'primary', text: returning ? 'Вернуться в строй' : 'Встать в строй', attrs: { type: 'button' } });
    const screen = h(
      'section',
      { class: 'intro', attrs: { 'aria-labelledby': 'intro-title' } },
      h(
        'div',
        { class: 'intro-col' },
        h('h1', { text: 'Короткий тёмный век', attrs: { id: 'intro-title' } }),
        h('p', { class: 'lead', text: 'Игра о крысиных солдатах, которые в темноте туннелей защищают свою коммуну. По живой ролевой игре.' }),
        book,
        h('p', { class: 'warning' }, h('strong', { text: 'В игре: ' }), 'война, гибель, жестокое насилие, мотив самоубийства, мигающий свет.'),
        h('fieldset', { class: 'seg' }, h('legend', { text: 'Чем вы слушаете' }), ...radios),
        h('p', { class: 'note', text: 'В темноте звук — половина того, что вы знаете. Лучше всего в наушниках.' }),
        button,
        h('p', { class: 'foot', text: 'Игра сохраняется в этом браузере. В общую книгу учёта уходит только счёт, без имён.' }),
      ),
    );
    root.append(screen);
    button.focus();
    button.addEventListener('click', () => {
      const picked = screen.querySelector<HTMLInputElement>('input[name="output"]:checked')?.value as Output | undefined;
      screen.remove();
      resolve({ ...settings, output: picked ?? settings.output });
    });
  });
}

/** Phones get a polite note instead of the game: it needs a keyboard and, ideally, headphones. */
export function showDesktopOnly(root: HTMLElement): void {
  root.append(
    h(
      'section',
      { class: 'intro', attrs: { 'aria-labelledby': 'intro-title' } },
      h(
        'div',
        { class: 'intro-col' },
        h('h1', { text: 'Короткий тёмный век', attrs: { id: 'intro-title' } }),
        h('p', { class: 'lead', text: 'Это игра для компьютера: в ней нужны клавиатура и, лучше всего, наушники.' }),
        h('p', { class: 'note', text: 'Откройте эту страницу на компьютере.' }),
      ),
    ),
  );
}

export function isPhone(): boolean {
  if (new URLSearchParams(location.search).has('desktop')) return false;
  return window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 768;
}
