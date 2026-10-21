/**
 * How each character looks as a puppet (concept «Персонажи»): what makes the silhouette readable at a
 * glance. Sizes are relative to an ordinary rat; `pace` is reference pixels per 12 fps step when walking.
 */
import type { PuppetLook } from '../render/puppet.ts';
import { PLAYER_ID } from './soldiers.ts';

export interface Look extends PuppetLook {
  name: string;
  /** Height relative to an ordinary rat. */
  size: number;
  pace: number;
  /** The paper of his truth-layer cut-out (grey hair for the old soldier). */
  paper?: number;
}

export const LOOKS: Readonly<Record<string, Look>> = {
  general: { name: 'Генерал', hat: 'cap', size: 1.1, pace: 8 },
  krypotkin: { name: 'Крыпоткин', hat: 'none', beard: true, glasses: true, book: true, stoop: 0.1, size: 1, pace: 6, paper: 0x3a342f },
  norkin: { name: 'Норкин', size: 0.97, pace: 9 },
  korochkina: { name: 'Корочкина', braid: true, size: 0.96, pace: 9 },
  podvalny: { name: 'Подвальный', size: 1.04, pace: 9 },
  syrkov: { name: 'Сырков', girth: 1.18, size: 0.95, pace: 8 },
  sedoy: { name: 'Седой', moustache: true, stoop: 0.06, size: 1, pace: 6, paper: 0x55504a },
  khvostov: { name: 'Хвостов', girth: 1.14, size: 1.14, pace: 9 },
  kroshkin: { name: 'Крошкин', instrument: 'guitar', size: 0.93, pace: 9 },
  cherdakov: { name: 'Чердаков', instrument: 'bass', size: 1.02, pace: 9 },
  zernov: { name: 'Зернов', instrument: 'drum', size: 0.98, pace: 9 },
  [PLAYER_ID]: { name: 'Ты', size: 1, pace: 10 },
};

export function look(id: string): Look {
  return LOOKS[id] ?? { name: id, size: 1, pace: 9 };
}
