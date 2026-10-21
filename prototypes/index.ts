/** The observer's page: what each prototype asks, links to give testers, and the runs saved in this browser. */
import './shared/fonts.ts';
import './shared/base.css';
import './list.css';
import { h } from './shared/dom.ts';
import { clearRuns, loadRuns, runsText } from './shared/session.ts';

const PROTOS: [string, string, string][] = [
  ['coordinator', 'Координатор: вспышки', 'Интересно ли быть голосом: видеть поле только во вспышках и вести слепого напарника тремя командами?'],
  ['striker', 'Ударник: темнота', 'Интересно ли быть слепым: по голосу напарника, нюху и звуку решать, верить ему или идти на запах?'],
  ['brawl', 'Драка: комната бунта', 'Работает ли бунт как Hotline Miami на плакате, и хочется ли ещё раз?'],
];

const root = document.getElementById('list')!;
const runs = loadRuns();
const copy = h('button', { class: 'secondary', text: 'Скопировать всё', attrs: { type: 'button' } });
const clear = h('button', { class: 'secondary', text: 'Очистить', attrs: { type: 'button' } });
copy.addEventListener('click', () => {
  void navigator.clipboard?.writeText(runsText(loadRuns())).then(() => (copy.textContent = 'Скопировано'));
});
clear.addEventListener('click', () => {
  if (clear.dataset.armed) {
    clearRuns();
    location.reload();
  } else {
    clear.dataset.armed = '1';
    clear.textContent = 'Точно очистить?';
  }
});

root.append(
  h('h1', { text: 'Прототипы вехи 1' }),
  h('p', { class: 'lead', text: 'Одноразовые прототипы «Короткого тёмного века». Тестеру давайте прямую ссылку и ничего не объясняйте. Критерии «оставить или выбросить» и порядок проверки — в prototypes/README.md.' }),
  h(
    'ol',
    { class: 'protos' },
    ...PROTOS.map(([id, title, question]) => {
      const n = runs.filter((r) => r.proto === id).length;
      return h('li', {}, h('a', { text: title, attrs: { href: `./${id}/` } }), h('p', { text: question }), h('p', { class: 'muted', text: n ? `Прогонов в этом браузере: ${n}` : 'Прогонов в этом браузере ещё нет' }));
    }),
  ),
  h('h2', { text: 'Итоги прогонов в этом браузере' }),
  runs.length ? h('pre', { class: 'runs', text: runsText(runs) }) : h('p', { class: 'muted', text: 'Пока пусто. Итоги появятся здесь после каждого прогона.' }),
  h('div', { class: 'row' }, copy, clear),
);
