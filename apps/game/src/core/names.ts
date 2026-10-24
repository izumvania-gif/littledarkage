/** The name a recruit gives at the lineup. Past soldiers' names are crossed out in the register and can't be taken again. */

export const MAX_NAME = 24;

export type NameCheck =
  | { ok: true; name: string }
  | { ok: false; reason: 'empty' | 'chars' | 'long' | 'taken' };

/** Trims, collapses spaces and capitalises each word: «  вася  пупкин » → «Вася Пупкин». */
export function normalizeName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toLocaleUpperCase('ru') + w.slice(1))
    .join(' ');
}

/** Case-insensitive, and «ё» counts as «е». */
export function sameName(a: string, b: string): boolean {
  const key = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е');
  return key(a) === key(b);
}

export function checkName(raw: string, taken: readonly string[]): NameCheck {
  const name = normalizeName(raw);
  if (!name) return { ok: false, reason: 'empty' };
  if (name.length > MAX_NAME) return { ok: false, reason: 'long' };
  if (!/^[\p{L}][\p{L}' -]*$/u.test(name)) return { ok: false, reason: 'chars' };
  if (taken.some((t) => sameName(t, name))) return { ok: false, reason: 'taken' };
  return { ok: true, name };
}

export const NAME_ERRORS: Record<Exclude<NameCheck, { ok: true }>['reason'], string> = {
  empty: 'Громче. Имя.',
  chars: 'Только буквы, пробел и дефис.',
  long: `Короче. Не больше ${MAX_NAME} букв.`,
  taken: 'Рядовой с таким именем уже числится. Другое.',
};

type Case = 'gen' | 'dat';

/**
 * A name in the genitive («семье рядового Петрова») or dative («Кому: Петровой») — the forms a triangle and an
 * envelope need (concept §10 «Склонение имени»: guessed here, confirmed or corrected once by the player). Each
 * word is declined on its own, with the usual Russian surname and first-name endings; unknown shapes stay as
 * they are, which is how indeclinable names (Шевчук for a woman, Дюма, Гёте) behave anyway.
 */
export function declineName(name: string, fem: boolean, c: Case): string {
  return name
    .split(' ')
    .map((w) => w.split('-').map((part) => declineWord(part, fem, c)).join('-'))
    .join(' ');
}

export const dative = (name: string, fem: boolean): string => declineName(name, fem, 'dat');
export const genitive = (name: string, fem: boolean): string => declineName(name, fem, 'gen');

const SIBILANT = /[жшчщц]$/;
const VELAR = /[гкх]$/;

function declineWord(w: string, fem: boolean, c: Case): string {
  if (w.length < 2) return w;
  const low = w.toLocaleLowerCase('ru');
  const cut = (n: number, end: string) => w.slice(0, w.length - n) + end;
  const stem = low.slice(0, -1);
  if (fem) {
    // Иванова, Сорокина: -ой in both cases.
    if (/(ова|ева|ёва|ина|ына)$/.test(low)) return cut(1, 'ой');
    // Подвальная, Толстая.
    if (/ая$/.test(low)) return cut(2, 'ой');
    if (/ия$/.test(low)) return cut(1, 'и');
    if (/а$/.test(low)) return c === 'dat' ? cut(1, 'е') : cut(1, SIBILANT.test(stem) || VELAR.test(stem) ? 'и' : 'ы');
    if (/я$/.test(low)) return c === 'dat' ? cut(1, 'е') : cut(1, 'и');
    if (/ь$/.test(low)) return cut(1, 'и');
    return w;
  }
  // Иванов, Пушкин: -у / -а.
  if (/(ов|ев|ёв|ин|ын)$/.test(low)) return w + (c === 'dat' ? 'у' : 'а');
  // Подвальный, Седой, Горький, Высоцкий.
  if (/(ый|ой)$/.test(low) || /кий$/.test(low)) return cut(2, c === 'dat' ? 'ому' : 'ого');
  if (/ий$/.test(low)) return cut(1, c === 'dat' ? 'ю' : 'я');
  if (/(их|ых|ко|аго|яго)$/.test(low) || /[еиоуыэю]$/.test(low)) return w;
  if (/а$/.test(low)) return c === 'dat' ? cut(1, 'е') : cut(1, SIBILANT.test(stem) || VELAR.test(stem) ? 'и' : 'ы');
  if (/я$/.test(low)) return c === 'dat' ? cut(1, 'е') : cut(1, 'и');
  if (/[ьй]$/.test(low)) return cut(1, c === 'dat' ? 'ю' : 'я');
  return w + (c === 'dat' ? 'у' : 'а');
}
