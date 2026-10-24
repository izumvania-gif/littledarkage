/**
 * The battle in words for agent mode: the coordinator's field as the lamp showed it, and what a blind striker
 * smells. Pure functions over the battle's JSON state, so they are tested without a browser.
 */
import { CMD_LABEL, obstacleAt, SIZE, type Battle, type Cmd, type Dir, type Scent } from '../core/battle.ts';
import { PLAYER_ID } from '../content/soldiers.ts';

const ARROW = ['^', '>', 'v', '<'] as const;
/** Facing, as the coordinator sees the field (row 0 is the far end, up the screen). */
const FACING = ['к дальнему краю', 'вправо', 'к зоне координаторов', 'влево'] as const;

export const dirWord = (d: Dir): string => FACING[d];

/** A letter for each striker on the field (Я for the player). */
export function letters(b: Battle): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  for (const u of b.units) out.set(u.id, u.id === PLAYER_ID ? 'Я' : String.fromCharCode(65 + i++));
  return out;
}

/**
 * The field as a grid of two-character cells, row 0 (the far end) on top, columns left to right as the
 * coordinator sees them, then who is who. Pass `visible(b)`: traps nobody has stepped on are not shown.
 */
export function fieldLines(b: Battle, nameOf: (id: string) => string, mine: readonly string[]): string[] {
  const tag = letters(b);
  const rows: string[] = [`    ${[...Array(SIZE).keys()].map((x) => `${x} `).join('')}`];
  for (let y = 0; y < SIZE; y++) {
    let row = `${String(y).padStart(2)}  `;
    for (let x = 0; x < SIZE; x++) {
      const u = b.units.find((it) => it.alive && it.x === x && it.y === y);
      const c = b.creatures.find((it) => it.alive && it.x === x && it.y === y);
      const t = b.traps.find((it) => it.x === x && it.y === y);
      const s = b.secrets.find((it) => !it.taken && it.x === x && it.y === y);
      row += u ? `${tag.get(u.id)}${ARROW[u.dir]}` : c ? (c.strong ? 'W ' : 'w ') : obstacleAt(b, x, y) ? '##' : t ? 'x ' : s ? '* ' : '. ';
    }
    rows.push(row.trimEnd());
  }
  const who = b.units.map((u) => {
    const own = mine.includes(u.id) ? ' (говорите за него вы)' : u.coord ? ` (голос — ${nameOf(u.coord)})` : ' (без голоса)';
    return u.alive
      ? `${tag.get(u.id)} — ${nameOf(u.id)}${own}: клетка ${u.x},${u.y}, смотрит ${dirWord(u.dir)}, хитов ${u.hp}, действий ${u.actions}${u.bag ? ', с мешком' : ''}`
      : `${tag.get(u.id)} — ${nameOf(u.id)}: выбыл`;
  });
  const creatures = b.creatures.filter((c) => c.alive);
  return [
    'Поле во вспышке лампы (ряд 0 — дальний край, ряд 8 — ближний к зоне координаторов; столбцы слева направо):',
    ...rows,
    'Обозначения: буква со стрелкой — ударник и куда он смотрит (^ к дальнему краю, v к зоне); w — тварь, W — сильная тварь; x — сработавшая ловушка; * — секрет; ## — препятствие; ловушки, на которые не наступали, не видны.',
    ...who,
    `Тварей на поле: ${creatures.length}${creatures.some((c) => c.strong) ? `, из них сильных ${creatures.filter((c) => c.strong).length}` : ''}.`,
  ];
}

/** «впереди справа», «сзади», «слева» from offsets relative to where the striker looks. */
export function sideWord(right: number, ahead: number): string {
  const fb = ahead > 0 ? 'впереди' : ahead < 0 ? 'сзади' : '';
  const lr = right > 0 ? 'справа' : right < 0 ? 'слева' : '';
  return [fb, lr].filter(Boolean).join(' ') || 'вплотную';
}

/**
 * What a blind striker smells. Plain, the haze gives only a rough side and how strong; after «нюхай» the smell
 * is sharp: cells ahead and to the side.
 */
export function scentLines(scents: readonly Scent[], sharp: boolean): string[] {
  if (!scents.length) return ['Запаха тварей рядом нет.'];
  return scents
    .slice()
    .sort((a, b) => b.strength - a.strength)
    .map((s) => {
      const strength = s.strength > 0.7 ? 'сильно' : s.strength > 0.4 ? 'заметно' : 'слабо';
      const kind = s.strong ? 'тяжёлый, чужой запах' : 'запах твари';
      if (!sharp) {
        // The haze: one rough side, by whichever offset is larger.
        const side = Math.abs(s.ahead) >= Math.abs(s.right) ? sideWord(0, s.ahead) : sideWord(s.right, 0);
        return `${kind} — ${side}, ${strength}`;
      }
      const ahead = s.ahead ? `${Math.abs(s.ahead)} ${s.ahead > 0 ? 'вперёд' : 'назад'}` : '';
      const right = s.right ? `${Math.abs(s.right)} ${s.right > 0 ? 'вправо' : 'влево'}` : '';
      return `${kind} — ${sideWord(s.right, s.ahead)}: ${[ahead, right].filter(Boolean).join(', ') || 'вплотную'} (клеток), ${strength}`;
    });
}

export const cmdWord = (c: Cmd): string => CMD_LABEL[c];
