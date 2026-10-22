/**
 * The finale's beats and words, kept free of Pixi and the DOM so they can be tested. The order is the role-play's:
 * darkness and the replies that never arrived, the children's letters that reached nobody, the general's desk,
 * «К стене. В шеренгу», the cold light and the same speech word for word, then the names.
 */
import { LETTERS, letter } from '../../content/letters.ts';
import { PLAYER_INDEX } from '../../content/recruits.ts';
import { sameName } from '../../core/names.ts';
import type { Ending, FinaleContext } from './types.ts';

export type Beat =
  /** The player's replies home, one by one in the dark (skipped when there are none). */
  | 'replies'
  /** The children's letters that came to nobody. */
  | 'children'
  /** The general's desk: the book of records, triangles to the player's names, the white envelope. */
  | 'desk'
  /** Steps in the dark and a voice: «К стене. В шеренгу». */
  | 'toWall'
  /** The cold light comes on over the wall. */
  | 'light'
  | 'speech'
  /** «Назовите свои имена». */
  | 'askNames'
  /** The recruits call out their names; in «Шеренга» the player gives one too. */
  | 'rollCall'
  /** Nobody answers (the empty wall). */
  | 'silence'
  | 'title';

export function beats(ending: Ending, replies: number): Beat[] {
  return [
    ...(replies > 0 ? (['replies'] as const) : []),
    'children',
    'desk',
    'toWall',
    'light',
    'speech',
    'askNames',
    ending === 'emptyWall' ? 'silence' : 'rollCall',
    'title',
  ];
}

/** The three children's letters (2, 6, 17): written to nobody in the game, read in the dark after the replies. */
export const CHILDREN_LETTERS: readonly number[] = LETTERS.filter((l) => l.to === null && l.cycle === null).map((l) => l.n);

/** Who stands in the spotlight: the general, or the player's own rat in his cap. */
export function inSpot(ending: Ending): 'general' | 'player' {
  return ending === 'newGeneral' ? 'player' : 'general';
}

/** The speech types itself in «Новый генерал»: the player can neither stop nor hurry it. */
export function speechLocked(ending: Ending): boolean {
  return ending === 'newGeneral';
}

/** Places along the wall, as in the prologue's lineup. */
export const WALL_SLOTS = 7;

export type Slot = { kind: 'recruit'; name: string } | { kind: 'player' };

/**
 * The line along the wall, left to right as the one in the spotlight sees it. In «Шеренга» the player stands
 * fifth again, as at the first lineup; in «Новый генерал» the player is in the spotlight and the line is all
 * recruits; the empty wall has nobody.
 */
export function lineOrder(ending: Ending, recruits: readonly string[]): Slot[] {
  if (ending === 'emptyWall') return [];
  if (ending === 'newGeneral') return recruits.slice(0, WALL_SLOTS).map((name) => ({ kind: 'recruit', name }));
  const line: Slot[] = recruits.slice(0, WALL_SLOTS - 1).map((name) => ({ kind: 'recruit', name }));
  line.splice(Math.min(PLAYER_INDEX, line.length), 0, { kind: 'player' });
  return line;
}

function unique(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const n of names) if (n.trim() && !out.some((o) => sameName(o, n))) out.push(n);
  return out;
}

/**
 * Names the new roll call refuses with «Рядовой с таким именем уже числится. Другое»: everyone in the book, the
 * player's names of this run, and the recruits standing in the line now.
 */
export function refusedNames(ctx: Pick<FinaleContext, 'taken' | 'register' | 'formerNames' | 'player' | 'recruits'>): string[] {
  return unique([...ctx.taken, ...ctx.register.map((e) => e.name), ...ctx.formerNames, ctx.player.name, ...ctx.recruits]);
}

/**
 * The triangles on the general's desk, one per name the player went by: the letters that came after the
 * addressee was gone. The current name is the last of them; the white envelope bears it.
 */
export function triangleNames(formerNames: readonly string[], current: string): string[] {
  return unique([...formerNames, current]);
}

/** The page of the book on the desk: the last entries that fit, and how many earlier ones are left off. */
export function registerPage<T>(entries: readonly T[], fit: number): { shown: T[]; earlier: number } {
  const shown = entries.slice(Math.max(0, entries.length - fit));
  return { shown, earlier: entries.length - shown.length };
}

/** The address on the white envelope: the family of the soldier. */
export function envelopeAddress(name: string, fem: boolean): string {
  return `Семье ${fem ? 'рядовой' : 'рядового'} ${name}`;
}

/**
 * What the white envelope holds (letter 5: «надеюсь не увидеть того самого конверта… И он каждый раз белый»):
 * the general's form, the same for everyone, whatever the book says. A draft for the author.
 */
export function noticeText(name: string, fem: boolean): string {
  return fem
    ? `Ваша дочь, рядовая ${name}, пала смертью храбрых, защищая коммуну. Коммуна помнит каждого.`
    : `Ваш сын, рядовой ${name}, пал смертью храбрых, защищая коммуну. Коммуна помнит каждого.`;
}

/** The line over a reply in the dark: which letter it answered. */
export function replyHeading(n: number): string {
  try {
    return `На письмо ${letter(n).fromLine}`;
  } catch {
    return 'Ответ домой';
  }
}

/** Words of the finale that are not the speech. Drafts for the author. */
export const WORDS = {
  replyStamp: 'не доставлено',
  deskBook: 'Стол генерала. Книга учёта открыта на последней странице.',
  deskTriangles: (count: number) =>
    count > 1 ? 'Стопка треугольников на ваши прежние имена. На каждом штамп: «Адресат выбыл».' : 'Треугольник на ваше имя. Поверх штамп: «Адресат выбыл».',
  /** The general addresses the white envelopes; after the mutiny that killed him they lie addressed already. */
  deskEnvelopes: (ending: Ending) => (ending === 'newGeneral' ? 'Рядом стопка белых конвертов, уже надписанных.' : 'Рядом генерал надписывает белые конверты.'),
  deskYours: 'На верхнем — ваше имя.',
  /** Nobody is seen doing it: the line is crossed out all the same. */
  deskStrike: 'Последнюю строку в книге вычёркивают.',
  notice: 'Извещение',
  steps: 'Шаги.',
  toWall: '— К стене. В шеренгу.',
  /** What the cold light shows first, by ending. */
  wall: { lineup: 'Шеренга у стены. Лица все знакомые.', newGeneral: 'В пятне прожектора не генерал. Там стоите вы, в его фуражке.', emptyWall: 'Генерал перед стеной. У стены никого.' } satisfies Record<Ending, string>,
  askNames: 'Назовите свои имена.',
  title: 'Короткий тёмный век',
} as const;
