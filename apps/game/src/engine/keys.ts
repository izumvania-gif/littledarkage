/**
 * Key remapping without touching the stages (concept §10 «Клавиши»). Every stage listens for physical keys by
 * `KeyboardEvent.code` — the game's keys. The player may put any game key on another physical key: a
 * capture-phase listener on window stops the original press and sends the same press again with the game key's
 * code, at the same target, so the stages hear what they always heard. A physical key nobody remapped is
 * itself; the old key of a moved game key keeps working unless something else took it. Esc is never remapped,
 * nothing is while typing in a field or with Ctrl, Alt or Meta held.
 */
import type { KeyMap } from '../core/settings.ts';

export type Place = 'everywhere' | 'barracks' | 'coordinator' | 'striker' | 'duties' | 'mutiny' | 'letters';

export const PLACE_NAMES: Record<Place, string> = {
  everywhere: 'везде',
  barracks: 'казарма',
  coordinator: 'бой у лампы',
  striker: 'бой вслепую',
  duties: 'наряды',
  mutiny: 'бунт',
  letters: 'письма',
};

export interface GameKey {
  code: string;
  /** What the key does, place by place. */
  does: Partial<Record<Place, string>>;
  /** Only a second key for something that has its own: taking it is no conflict. */
  spare?: boolean;
}

/** The keys the game listens for (Numpad twins of digits and Enter keep working on their own). */
export const GAME_KEYS: readonly GameKey[] = [
  { code: 'Space', does: { everywhere: 'дальше', coordinator: 'прыжок', striker: 'прыжок', mutiny: 'удар', duties: 'взять, штриховать' } },
  { code: 'Enter', does: { everywhere: 'дальше, выбрать', coordinator: 'готово', striker: 'готово', barracks: 'подойти' } },
  { code: 'Backspace', does: { coordinator: 'стереть команду', striker: 'стереть команду', everywhere: 'речь генерала: убрать строку' } },
  { code: 'KeyW', does: { coordinator: 'шаг вперёд', striker: 'шаг, дважды — два', duties: 'поднять, рука вверх', mutiny: 'вверх' } },
  { code: 'KeyA', does: { barracks: 'идти влево', coordinator: 'шаг влево', striker: 'шаг влево', duties: 'влево', mutiny: 'влево' } },
  { code: 'KeyS', does: { coordinator: 'шаг назад', striker: 'назад', duties: 'опустить, рука вниз', mutiny: 'вниз' } },
  { code: 'KeyD', does: { barracks: 'идти вправо', coordinator: 'шаг вправо', striker: 'шаг вправо', duties: 'вправо', mutiny: 'вправо' } },
  { code: 'KeyQ', does: { coordinator: 'налево', striker: 'поворот налево', mutiny: 'бросить' } },
  { code: 'KeyE', does: { barracks: 'подойти', coordinator: 'направо', striker: 'поворот направо', duties: 'ручка: взять', mutiny: 'подобрать' } },
  { code: 'KeyX', does: { coordinator: 'два шага вперёд', striker: 'кругом' } },
  { code: 'KeyZ', does: { coordinator: 'кругом', striker: 'стой' } },
  { code: 'KeyC', does: { coordinator: 'стой', striker: 'подписи звуков' } },
  { code: 'KeyF', does: { striker: 'нюхать', mutiny: 'подобрать (второй)' } },
  { code: 'KeyG', does: { striker: 'накрыть мешком' } },
  { code: 'KeyP', does: { everywhere: 'пауза' } },
  { code: 'KeyR', does: { mutiny: 'начать комнату заново' } },
  { code: 'KeyH', does: { mutiny: 'управление' } },
  { code: 'KeyB', does: { mutiny: 'без спешки' } },
  { code: 'KeyK', does: { mutiny: 'бросить (второй), пропустить драку' } },
  { code: 'KeyJ', does: { mutiny: 'удар (второй)' }, spare: true },
  { code: 'Tab', does: { coordinator: 'следующий ударник', everywhere: 'по кнопкам' } },
  { code: 'ArrowLeft', does: { barracks: 'идти влево', striker: 'поворот налево', duties: 'влево', mutiny: 'влево', everywhere: 'выбор' } },
  { code: 'ArrowRight', does: { barracks: 'идти вправо', striker: 'поворот направо', duties: 'вправо', mutiny: 'вправо', everywhere: 'выбор' } },
  { code: 'ArrowUp', does: { striker: 'шаг', duties: 'вверх', mutiny: 'вверх', everywhere: 'выбор' } },
  { code: 'ArrowDown', does: { striker: 'назад', duties: 'вниз', mutiny: 'вниз', everywhere: 'выбор' } },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ code: `Digit${n}`, does: { everywhere: `ответ ${n}`, ...(n <= 3 ? { coordinator: `кому: ${n}-й` } : {}), ...(n <= 2 ? { mutiny: n === 1 ? 'ударить' : 'опустить руки' } : {}) } })),
  { code: 'Digit0', does: { everywhere: 'речь генерала: промолчать' } },
];

/** Never moved: it closes windows and pauses everywhere. */
export const FIXED = new Set(['Escape']);

const GAME = new Set(GAME_KEYS.map((k) => k.code));
const SPARE = new Set(GAME_KEYS.filter((k) => k.spare).map((k) => k.code));
export const isGameKey = (code: string): boolean => GAME.has(code);

/** The game key a physical key stands for now. */
export function produces(map: KeyMap, physical: string): string {
  return map[physical] ?? physical;
}

/** The physical keys that give a game key now: a remapped one first, then the key itself if nothing took it. */
export function keysFor(map: KeyMap, game: string): string[] {
  const out = Object.keys(map).filter((p) => map[p] === game);
  if (!(game in map)) out.push(game);
  return out;
}

export type Assign = { ok: true; map: KeyMap } | { ok: false; reason: 'fixed' } | { ok: false; reason: 'taken'; by: string };

/**
 * Puts a game key on a physical key. If that physical key already gives another game key, it is refused with
 * `taken` unless `swap`: then the other game key moves to where this one was.
 */
export function assign(map: KeyMap, game: string, physical: string, swap = false): Assign {
  if (FIXED.has(game) || FIXED.has(physical)) return { ok: false, reason: 'fixed' };
  const next: KeyMap = { ...map };
  const now = produces(map, physical);
  if (now === game) return { ok: true, map: next };
  // Where this game key sits now (its custom key, or itself).
  const was = keysFor(map, game)[0] ?? game;
  // The other game key loses nothing if it is on another key too.
  const alone = isGameKey(now) && !SPARE.has(now) && keysFor(map, now).every((p) => p === physical);
  if (alone) {
    if (!swap) return { ok: false, reason: 'taken', by: now };
    next[was] = now;
  } else {
    // A free key: the game key's earlier custom key goes back to being itself.
    for (const p of Object.keys(next)) if (next[p] === game) delete next[p];
  }
  next[physical] = game;
  for (const p of Object.keys(next)) if (next[p] === p) delete next[p];
  return { ok: true, map: next };
}

// ---------- names on screen ----------

const NAMES: Record<string, string> = {
  Space: 'Пробел',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Backspace: 'Backspace',
  Tab: 'Tab',
  Escape: 'Esc',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Slash: '/',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  CapsLock: 'Caps Lock',
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

/** «A», «1», «Пробел», «←» — a physical key as printed on it (Latin layout). */
export function keyName(code: string): string {
  if (NAMES[code]) return NAMES[code]!;
  const m = /^(?:Key|Digit)(.)$/.exec(code) ?? /^Numpad(\d)$/.exec(code);
  if (m) return m[1]!;
  if (/^F\d{1,2}$/.test(code)) return code;
  return code;
}

/** The `key` a remapped press carries, for the few handlers that look at it (arrows, Enter). */
function keyValue(code: string): string {
  const m = /^Key(.)$/.exec(code);
  if (m) return m[1]!.toLowerCase();
  const d = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (d) return d[1]!;
  if (code === 'Space') return ' ';
  if (code === 'NumpadEnter') return 'Enter';
  return code;
}

// ---------- the layer ----------

let paused = false;
let current: () => KeyMap = () => ({});

/** While the settings panel listens for a key to assign, presses must reach it as they are. */
export function pauseRemap(on: boolean): void {
  paused = on;
}

/** The physical key that gives a game key now, as printed: for key hints that follow the player's remap. */
export function hintFor(game: string): string {
  return keyName(keysFor(current(), game)[0] ?? game);
}

function typing(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t instanceof HTMLTextAreaElement) return true;
  if (t instanceof HTMLInputElement) return !['radio', 'checkbox', 'range', 'button', 'submit'].includes(t.type);
  return t instanceof HTMLSelectElement;
}

/** Installs the layer once; `map` is read at every press, so changes take effect at once. */
export function installKeyRemap(map: () => KeyMap): () => void {
  current = map;
  const relay = (e: KeyboardEvent) => {
    if (!e.isTrusted || paused || e.ctrlKey || e.altKey || e.metaKey || typing(e.target)) return;
    const game = map()[e.code];
    if (!game || game === e.code || FIXED.has(e.code)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const again = new KeyboardEvent(e.type, { code: game, key: keyValue(game), bubbles: true, cancelable: true, composed: true, repeat: e.repeat, shiftKey: e.shiftKey, location: e.location });
    (e.target ?? window).dispatchEvent(again);
  };
  window.addEventListener('keydown', relay, true);
  window.addEventListener('keyup', relay, true);
  return () => {
    window.removeEventListener('keydown', relay, true);
    window.removeEventListener('keyup', relay, true);
  };
}
