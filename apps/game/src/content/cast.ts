/**
 * Who can speak in the script and how their lines look on the caption plate: the general types on his
 * machine, Норкин writes in his own hand, the rest speak plainly. Ids are the script's #speaker tags.
 */
import { SOLDIERS, type Hand } from './soldiers.ts';

export type LineStyle = Hand | 'type';

export interface Speaker {
  name: string;
  style: LineStyle;
}

const EXTRA: Record<string, Speaker> = {
  general: { name: 'Генерал', style: 'type' },
  medic: { name: 'Фельдшер', style: 'serif' },
};

/** The player's lines show under the player's name (filled in by the caller). */
export const PLAYER_SPEAKER = 'player';

export function speaker(id: string): Speaker | null {
  if (EXTRA[id]) return EXTRA[id];
  const s = SOLDIERS[id];
  return s ? { name: s.name, style: s.hand } : null;
}

export function isSpeaker(id: string): boolean {
  return id === PLAYER_SPEAKER || speaker(id) !== null;
}
