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
