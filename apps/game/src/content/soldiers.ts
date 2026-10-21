/**
 * The soldiers as the battle knows them (concept «Персонажи», «Напарник и другие пары»): how a coordinator
 * sounds and writes, the words he uses, and how a striker carries out what he hears. A soldier who dies and
 * comes back as a newcomer keeps his signal, handwriting and words under the new name.
 */
import type { Quirk } from '../core/ai.ts';

/** A coordinator's signal before his line, heard from where he stands (no recorded voices yet). */
export type Signal = 'whistle' | 'snap' | 'cough' | 'pipe';

/** How his lines look on screen: his own handwriting (at most three hands), typed, or plain. */
export type Hand = 'hand' | 'mono' | 'serif';

export interface Words {
  /** Says this instead of «шаг» («чуток вперёд»). */
  step?: string;
  /** Says this for two steps («раз-два вперёд»). */
  step2?: string;
  /** Scared, he mixes up left and right in what he says. */
  swapsWhenScared?: boolean;
  /** Scared, he cuts every command to one word. */
  terseWhenScared?: boolean;
}

export interface Soldier {
  id: string;
  name: string;
  signal: Signal;
  hand: Hand;
  words: Words;
  quirks: readonly Quirk[];
  /** A big rat jumps three cells instead of two. */
  big?: boolean;
}

export const PLAYER_ID = 'player';

export const SOLDIERS: Readonly<Record<string, Soldier>> = {
  norkin: { id: 'norkin', name: 'Норкин', signal: 'whistle', hand: 'hand', words: { step: 'чуток', step2: 'раз-два', swapsWhenScared: true }, quirks: ['swapsWhenScared'] },
  korochkina: { id: 'korochkina', name: 'Корочкина', signal: 'pipe', hand: 'serif', words: {}, quirks: [] },
  podvalny: { id: 'podvalny', name: 'Подвальный', signal: 'cough', hand: 'serif', words: {}, quirks: ['believer'] },
  syrkov: { id: 'syrkov', name: 'Сырков', signal: 'snap', hand: 'serif', words: {}, quirks: ['timid'] },
  pyshkin: { id: 'pyshkin', name: 'Пышкин', signal: 'snap', hand: 'serif', words: {}, quirks: ['timid'] },
  sedoy: { id: 'sedoy', name: 'Седой', signal: 'cough', hand: 'mono', words: {}, quirks: [] },
  khvostov: { id: 'khvostov', name: 'Хвостов', signal: 'pipe', hand: 'serif', words: {}, quirks: [], big: true },
  kroshkin: { id: 'kroshkin', name: 'Крошкин', signal: 'snap', hand: 'serif', words: {}, quirks: [] },
  cherdakov: { id: 'cherdakov', name: 'Чердаков', signal: 'snap', hand: 'serif', words: {}, quirks: [] },
  zernov: { id: 'zernov', name: 'Зернов', signal: 'cough', hand: 'mono', words: { terseWhenScared: true }, quirks: [] },
  krypotkin: { id: 'krypotkin', name: 'Крыпоткин', signal: 'cough', hand: 'serif', words: {}, quirks: [] },
};

export function soldier(id: string): Soldier {
  const s = SOLDIERS[id];
  if (!s) throw new Error(`no soldier ${id}`);
  return s;
}
