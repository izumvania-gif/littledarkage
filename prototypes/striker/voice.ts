/** How the coordinators speak, and how a sound's side and distance are put into words for the captions. */
import type { Spot } from '../shared/sound.ts';
import type { Cmd } from '../shared/sim.ts';

/** Норкин's own words: «чуток» is a step, «раз-два» is two steps. */
const NORKIN: Record<Cmd, string> = {
  step: 'чуток вперёд',
  step2: 'раз-два вперёд',
  back: 'чуток назад',
  left: 'чуток влево',
  right: 'чуток вправо',
  turnL: 'налево',
  turnR: 'направо',
  about: 'кругом',
  jump: 'прыгай!',
  stay: 'стой',
  sniff: 'нюхай',
};

/** Everybody else says it by the book. */
const PLAIN: Record<Cmd, string> = {
  step: 'шаг вперёд',
  step2: 'два шага вперёд',
  back: 'шаг назад',
  left: 'шаг влево',
  right: 'шаг вправо',
  turnL: 'налево',
  turnR: 'направо',
  about: 'кругом',
  jump: 'прыжок!',
  stay: 'стой',
  sniff: 'нюхай',
};

/** A scared Норкин mixes up left and right. */
const SWAP: Partial<Record<Cmd, Cmd>> = { left: 'right', right: 'left', turnL: 'turnR', turnR: 'turnL' };

export const swapSides = (cmds: readonly Cmd[]): Cmd[] => cmds.map((c) => SWAP[c] ?? c);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function sentence(words: readonly string[]): string {
  return words.map((w) => cap(w)).map((w) => (w.endsWith('!') ? w : `${w}.`)).join(' ');
}

/** «Стой» said once for the rest of the turn: [шаг, стой, стой] is «Чуток вперёд. Стой.» */
function spoken(cmds: readonly Cmd[]): Cmd[] {
  const out = [...cmds];
  while (out.length > 1 && out[out.length - 1] === 'stay' && out[out.length - 2] === 'stay') out.pop();
  return out;
}

export function norkinLine(cmds: readonly Cmd[], scared: boolean): string {
  const words = spoken(cmds);
  const text = !words.length || (words.length === 1 && words[0] === 'stay') ? 'Стой. Ждём.' : sentence(words.map((c) => NORKIN[c]));
  // Scared, he stammers on the first word: the only outward sign that his sides may be mixed up.
  return scared ? `${text.charAt(0)}-${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

export function plainLine(name: string, cmds: readonly Cmd[]): string {
  const words = spoken(cmds);
  return `${name}, ${sentence(words.length ? words.map((c) => PLAIN[c]) : ['стой']).replace(/^./, (m) => m.toLowerCase())}`;
}

/** «спереди слева», «сзади»… for a spot around the listener. */
export function sideWord(p: Spot): string {
  const a = (Math.atan2(p.x, p.z) * 180) / Math.PI;
  const abs = Math.abs(a);
  const lr = a > 0 ? 'справа' : 'слева';
  if (abs <= 22.5) return 'спереди';
  if (abs <= 67.5) return `спереди ${lr}`;
  if (abs <= 112.5) return lr;
  if (abs <= 157.5) return `сзади ${lr}`;
  return 'сзади';
}

export function distWord(p: Spot): string {
  const d = Math.hypot(p.x, p.z);
  if (d <= 1.1) return 'вплотную';
  if (d <= 2.3) return 'близко';
  if (d <= 4.5) return 'недалеко';
  return 'далеко';
}

export const where = (p: Spot) => `${sideWord(p)}, ${distWord(p)}`;
