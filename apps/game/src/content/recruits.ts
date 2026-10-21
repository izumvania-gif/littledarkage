/** The recruits in the line, left to right as the general sees them; the player stands fifth. */
export const PLAYER = Symbol('player');

export const LINE: readonly (string | typeof PLAYER)[] = ['Норкин', 'Хвостов', 'Сырков', 'Крошкин', PLAYER, 'Чердаков', 'Зернов'];

export const PLAYER_INDEX = LINE.indexOf(PLAYER);
