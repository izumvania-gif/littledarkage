/**
 * The plates of the one-playing-tab rule (core/tabs.ts): a second tab waits to be told to take the game over; a
 * tab the game was taken from stops and offers to come back (which asks again).
 */
import { h } from './dom.ts';

/** In a new tab while another plays: resolves when the player chooses to play here. */
export function waitToTakeOver(root: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const button = h('button', { class: 'primary', text: 'Играть здесь', attrs: { type: 'button' } });
    const screen = h(
      'section',
      { class: 'intro', attrs: { role: 'alertdialog', 'aria-labelledby': 'tab-title' } },
      h(
        'div',
        { class: 'intro-col' },
        h('h1', { text: 'Игра уже открыта', attrs: { id: 'tab-title' } }),
        h('p', { class: 'lead', text: 'В другой вкладке идёт эта же игра. Чтобы два окна не путали одно сохранение, играть можно только в одном.' }),
        button,
        h('p', { class: 'foot', text: 'В той вкладке игра остановится там, где она сейчас, и продолжится здесь.' }),
      ),
    );
    root.append(screen);
    button.focus();
    button.addEventListener('click', () => {
      screen.remove();
      resolve();
    });
  });
}

/** The game was taken over by another tab: this one stops writing and covers itself. */
export function showTakenOver(root: HTMLElement): void {
  const button = h('button', { class: 'secondary', text: 'Вернуться сюда', attrs: { type: 'button' } });
  const screen = h(
    'section',
    { class: 'intro tab-lost', attrs: { role: 'alertdialog', 'aria-labelledby': 'tab-lost-title' } },
    h('div', { class: 'intro-col' }, h('h1', { text: 'Игра продолжается в другой вкладке', attrs: { id: 'tab-lost-title' } }), h('p', { class: 'lead', text: 'Здесь она остановлена и ничего не сохраняет.' }), button),
  );
  root.append(screen);
  button.focus();
  button.addEventListener('click', () => location.reload());
}
