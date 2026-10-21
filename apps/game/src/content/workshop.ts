/**
 * The workshop (concept «Казарма», prologue): the general explains the battle once, in his formulas, and the
 * player takes a few training moves with Норкин. Draft lines, to be checked with the author like the speech.
 */
export function workshopLines(rankAndName: string): string[] {
  return [
    'Воркшоп. Объясняю один раз.',
    'Ударник — на поле, глаза завязаны. Координатор — в зоне, у лампы.',
    'Лампа мигает — координатор смотрит. Потом говорит три команды. Ударник исполняет.',
    'Команды — от лица ударника. Его лево — не ваше лево.',
    `Вопросы? Вопросов нет. Норкин — повязку. ${rankAndName} — в зону.`,
  ];
}

export const WORKSHOP_END = 'Удовлетворительно. Разойдись.';
