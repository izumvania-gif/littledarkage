import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dative, genitive } from '../src/core/names.ts';

test('the dative on a triangle', () => {
  const cases: [string, boolean, string][] = [
    ['Петрова', true, 'Петровой'],
    ['Петров', false, 'Петрову'],
    ['Подвальный', false, 'Подвальному'],
    ['Седой', false, 'Седому'],
    ['Высоцкий', false, 'Высоцкому'],
    ['Георгий', false, 'Георгию'],
    ['Игорь', false, 'Игорю'],
    ['Андрей', false, 'Андрею'],
    ['Никита', false, 'Никите'],
    ['Иван Петров', false, 'Ивану Петрову'],
    ['Анна', true, 'Анне'],
    ['Мария', true, 'Марии'],
    ['Таня', true, 'Тане'],
    ['Любовь', true, 'Любови'],
    ['Шевчук', true, 'Шевчук'],
    ['Хвостенко', false, 'Хвостенко'],
    ['Черных', false, 'Черных'],
    ['Римский-Корсаков', false, 'Римскому-Корсакову'],
  ];
  for (const [n, f, want] of cases) assert.equal(dative(n, f), want, n);
});

test('the genitive on an envelope', () => {
  const cases: [string, boolean, string][] = [
    ['Петрова', true, 'Петровой'],
    ['Петров', false, 'Петрова'],
    ['Подвальный', false, 'Подвального'],
    ['Никита', false, 'Никиты'],
    ['Маша', true, 'Маши'],
    ['Ольга', true, 'Ольги'],
    ['Таня', true, 'Тани'],
    ['Иван', false, 'Ивана'],
  ];
  for (const [n, f, want] of cases) assert.equal(genitive(n, f), want, n);
});
