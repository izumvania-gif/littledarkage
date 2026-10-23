/**
 * How the shared register speaks on the first screen: the count of recruits and a line or two of what the other
 * barracks did. A first-timer sees only what spoils nothing; a soldier already crossed out in the book sees any.
 */
import type { RegisterResponse, RegisterStat } from './api.ts';

const LINES: Record<RegisterStat['key'], (p: number) => string> = {
  covered: (p) => `${p}% координаторов приняли удар за напарника`,
  krypotkinKill: (p) => `Крыпоткину помогли убить тварь в ${p}% прогонов`,
  recon: (p) => `${p}% ходили с Седым в дальний ход`,
  caught: (p) => `В ${p}% прогонов тварь взяли живой`,
  mutiny: (p) => `${p}% сказали генералу «мы не пойдём»`,
  general: (p) => `${p}% побывали генералом`,
  lineup: (p) => `${p}% снова встали в шеренгу`,
  newGeneral: (p) => `В ${p}% прогонов генерала убили`,
  emptyWall: (p) => `В ${p}% прогонов у стены не встал никто`,
};

/** What a first playthrough may hear without learning where the story goes. */
const SPOILER_FREE: readonly RegisterStat['key'][] = ['covered'];

export function statLine(s: RegisterStat): string {
  return LINES[s.key](Math.max(0, Math.min(100, Math.round(s.percent))));
}

/** «Новобранцев прибыло: 4 817» (a non-breaking space between thousands, as Russian print has it). */
export function arrivedLine(arrived: number): string {
  return `Новобранцев прибыло: ${Math.max(0, Math.floor(arrived)).toLocaleString('ru-RU')}`;
}

/** Up to `n` lines for the first screen, picked by `rnd` among those the player may see. */
export function pickStats(r: RegisterResponse, veteran: boolean, rnd: () => number, n = 2): string[] {
  const pool = r.stats.filter((s) => Object.hasOwn(LINES, s.key) && (veteran || SPOILER_FREE.includes(s.key)));
  const out: string[] = [];
  while (pool.length && out.length < n) out.push(statLine(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!));
  return out;
}
