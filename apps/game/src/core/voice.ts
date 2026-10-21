/**
 * Commands as a coordinator says them (concept «Голос напарника»). Quirks change the words, never the plan:
 * Норкин says «чуток» for a step and «раз-два» for two, and scared he swaps «влево» and «вправо»;
 * Зернов, scared, cuts everything to one word. The words come out as subtitle lines until voices are recorded.
 */
import type { Cmd } from './battle.ts';
import type { Words } from '../content/soldiers.ts';

const PLAIN: Record<Cmd, string> = {
  step: 'Шаг вперёд',
  step2: 'Два шага вперёд',
  back: 'Шаг назад',
  left: 'Шаг влево',
  right: 'Шаг вправо',
  turnL: 'Налево',
  turnR: 'Направо',
  about: 'Кругом',
  jump: 'Прыгай!',
  stay: 'Стой',
  sniff: 'Нюхай',
  cover: 'Накрывай!',
};

const TERSE: Record<Cmd, string> = {
  step: 'Вперёд',
  step2: 'Вперёд-вперёд',
  back: 'Назад',
  left: 'Влево',
  right: 'Вправо',
  turnL: 'Налево',
  turnR: 'Направо',
  about: 'Кругом',
  jump: 'Прыг!',
  stay: 'Стой',
  sniff: 'Нюх',
  cover: 'Мешок!',
};

const SWAP: Partial<Record<Cmd, Cmd>> = { left: 'right', right: 'left', turnL: 'turnR', turnR: 'turnL' };

/** What a «шаг» command sounds like with a soldier's own word for it. */
function wordFor(cmd: Cmd, w: Words): string {
  const tail: Partial<Record<Cmd, string>> = { step: 'вперёд', back: 'назад', left: 'влево', right: 'вправо' };
  if (w.step && tail[cmd]) return `${cap(w.step)} ${tail[cmd]}`;
  if (cmd === 'step2' && w.step2) return `${cap(w.step2)} вперёд`;
  return PLAIN[cmd];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const low = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export interface SayOptions {
  scared?: boolean;
  /** Named first when the line is meant for someone among several («Подвальный, стой»). */
  to?: string;
}

/** One line for a turn's commands. Repeated «стой» is said once; nothing but «стой» is «Стой. Ждём.» */
export function say(cmds: readonly Cmd[], w: Words, opts: SayOptions = {}): string {
  const scared = !!opts.scared;
  const parts: string[] = [];
  let prev: Cmd | null = null;
  for (const c of cmds) {
    if (c === 'stay' && prev === 'stay') continue;
    prev = c;
    const meant = scared && w.swapsWhenScared ? (SWAP[c] ?? c) : c;
    parts.push(scared && w.terseWhenScared ? TERSE[meant] : wordFor(meant, w));
  }
  if (!parts.length || cmds.every((c) => c === 'stay')) parts.splice(0, parts.length, 'Стой', 'Ждём');
  // Scared, he stumbles on the first word.
  if (scared && w.swapsWhenScared && parts[0]) parts[0] = `${parts[0].slice(0, 2)}… ${low(parts[0])}`;
  let line = parts.map((p) => (/[.!?…]$/.test(p) ? p : `${p}.`)).join(' ');
  if (opts.to) line = `${opts.to}, ${low(line)}`;
  return line;
}

/** The commands his words literally name: after a scared speaker's swap they differ from what he planned. */
export function said(cmds: readonly Cmd[], w: Words, scared: boolean): Cmd[] {
  return cmds.map((c) => (scared && w.swapsWhenScared ? (SWAP[c] ?? c) : c));
}
