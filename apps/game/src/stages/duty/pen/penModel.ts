/**
 * «Собрать и разобрать ручку на время» without pictures: an automatic ballpoint, five parts, one order. Kept
 * free of Pixi so it can be tested.
 *
 * The body stays in the hand; the other parts come off it from the outside in (tip, spring, refill, button)
 * and go back from the inside out. Unscrewing the tip lets the spring jump out onto the floor: it has to be
 * found before it can go back. A part taken out of turn is a mistake: the one in the way holds it (taking
 * apart), or it doesn't fit (putting together). Once together, the pen is checked by clicking its button.
 */

export type PartId = 'button' | 'body' | 'refill' | 'spring' | 'tip';

/** The parts that go onto the body, in the order they go on. */
export const ASSEMBLY: readonly Exclude<PartId, 'body'>[] = ['button', 'refill', 'spring', 'tip'];
/** And the order they come off. */
export const DISASSEMBLY: readonly Exclude<PartId, 'body'>[] = [...ASSEMBLY].reverse();

/** Names as the general says them: «Сначала — наконечник». */
export const PART_NAMES: Readonly<Record<PartId, string>> = {
  button: 'кнопка',
  body: 'корпус',
  refill: 'стержень',
  spring: 'пружина',
  tip: 'наконечник',
};

/** What the fingers feel, for the blind version: shapes, never names. */
export const PART_FEEL: Readonly<Record<PartId, string>> = {
  button: 'Короткий цилиндрик со шляпкой.',
  body: 'Пустая трубка с зажимом. В руке.',
  refill: 'Длинная тонкая трубочка. Кончик липкий.',
  spring: 'Тонкая, витая. Пружинит.',
  tip: 'Маленький конус. Внутри резьба.',
};

export type Where = 'pen' | 'table' | 'floor';

export type PenPhase = 'apart' | 'together' | 'check' | 'done';

export type PenEvent =
  | { t: 'off'; part: PartId }
  | { t: 'on'; part: PartId }
  /** Taking apart out of turn: `by` is the part in the way. */
  | { t: 'held'; part: PartId; by: PartId }
  /** Putting together out of turn: `want` is the part that goes on next. */
  | { t: 'wrong'; part: PartId; want: PartId }
  | { t: 'drop'; part: PartId }
  | { t: 'found'; part: PartId }
  /** The body is in the hand; reaching for it does nothing. */
  | { t: 'body' }
  /** The finished pen clicks. */
  | { t: 'click' }
  | { t: 'phase'; phase: PenPhase };

export class PenModel {
  readonly where: Record<PartId, Where> = { button: 'pen', body: 'pen', refill: 'pen', spring: 'pen', tip: 'pen' };
  phase: PenPhase = 'apart';
  mistakes = 0;
  dropped = 0;

  /** The part that comes off next (taking apart) or goes on next (putting together); null when there is none. */
  next(): PartId | null {
    if (this.phase === 'apart') return DISASSEMBLY.find((p) => this.where[p] === 'pen') ?? null;
    if (this.phase === 'together') return ASSEMBLY.find((p) => this.where[p] !== 'pen') ?? null;
    if (this.phase === 'check') return 'button';
    return null;
  }

  /** The player's hand closes on a part, wherever it lies. */
  take(part: PartId): PenEvent[] {
    if (this.phase === 'done') return [];
    if (part === 'body') return [{ t: 'body' }];
    const at = this.where[part];
    if (at === 'floor') {
      this.where[part] = 'table';
      return [{ t: 'found', part }, ...this.advance()];
    }
    if (this.phase === 'check') return part === 'button' && at === 'pen' ? this.click() : [];
    if (this.phase === 'apart') {
      if (at !== 'pen') return [];
      const next = this.next()!;
      if (part !== next) {
        this.mistakes++;
        return [{ t: 'held', part, by: next }];
      }
      const out: PenEvent[] = [{ t: 'off', part }];
      this.where[part] = 'table';
      // The tip held the spring down: off it goes.
      if (part === 'tip' && this.where.spring === 'pen') {
        this.where.spring = 'floor';
        this.dropped++;
        out.push({ t: 'drop', part: 'spring' });
      }
      return [...out, ...this.advance()];
    }
    // Putting together: only from the table.
    if (at !== 'table') return [];
    const want = this.next()!;
    if (part !== want) {
      this.mistakes++;
      return [{ t: 'wrong', part, want }];
    }
    this.where[part] = 'pen';
    return [{ t: 'on', part }, ...this.advance()];
  }

  /** The general takes the pen and does the rest himself (the time ran out). */
  finishForThem(): void {
    for (const p of ASSEMBLY) this.where[p] = 'pen';
    this.phase = 'done';
  }

  private click(): PenEvent[] {
    this.phase = 'done';
    return [{ t: 'click' }, { t: 'phase', phase: 'done' }];
  }

  private advance(): PenEvent[] {
    const all = (w: Where) => ASSEMBLY.every((p) => this.where[p] === w);
    if (this.phase === 'apart' && ASSEMBLY.every((p) => this.where[p] !== 'pen')) {
      this.phase = 'together';
      return [{ t: 'phase', phase: 'together' }];
    }
    if (this.phase === 'together' && all('pen')) {
      this.phase = 'check';
      return [{ t: 'phase', phase: 'check' }];
    }
    return [];
  }
}

/** The general's norms, in seconds: «норматив», and when he takes the pen away. */
export const PEN_NORM = { sighted: 20, blind: 45 } as const;
export const PEN_LIMIT = { sighted: 60, blind: 120 } as const;

/**
 * 0..1 by the general's measure: full marks within the norm, falling to a third by the limit, a tenth off
 * for every mistake; a pen he had to finish himself scores no more than 0.3.
 */
export function penScore(o: { seconds: number; mistakes: number; blind: boolean; timedOut: boolean }): number {
  const norm = o.blind ? PEN_NORM.blind : PEN_NORM.sighted;
  const limit = o.blind ? PEN_LIMIT.blind : PEN_LIMIT.sighted;
  const late = Math.max(0, Math.min(1, (o.seconds - norm) / (limit - norm)));
  const s = Math.max(0, Math.min(1, 1 - 0.65 * late - 0.1 * o.mistakes));
  return Math.round((o.timedOut ? Math.min(0.3, s) : s) * 100) / 100;
}

/** «Девятнадцать секунд» in figures: 19 секунд, 21 секунда, 23 секунды. */
export function secondsSaid(n: number): string {
  const k = Math.abs(n) % 100;
  const d = k % 10;
  const word = k > 10 && k < 20 ? 'секунд' : d === 1 ? 'секунда' : d >= 2 && d <= 4 ? 'секунды' : 'секунд';
  return `${n} ${word}`;
}

/**
 * Where the parts lie on the table: in a row in the order they came off, or, once the general has mixed them
 * (blind), scattered over the cloth, never closer than `gap` to each other. Reference pixels.
 */
export function tableSpots(order: readonly PartId[], rng: (() => number) | null, area = { x0: 260, x1: 1020, y0: 330, y1: 450 }, gap = 130): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  if (!rng) {
    const dx = (area.x1 - area.x0) / Math.max(1, order.length - 1);
    order.forEach((p, i) => (out[p] = [Math.round(area.x0 + dx * i), Math.round((area.y0 + area.y1) / 2)]));
    return out;
  }
  const placed: [number, number][] = [];
  for (const p of order) {
    let best: [number, number] = [area.x0, area.y0];
    let bestD = -1;
    // The farthest of a few tries from what is already there: spread out, not a grid.
    for (let i = 0; i < 24; i++) {
      const c: [number, number] = [Math.round(area.x0 + rng() * (area.x1 - area.x0)), Math.round(area.y0 + rng() * (area.y1 - area.y0))];
      const d = placed.length ? Math.min(...placed.map(([x, y]) => Math.hypot(x - c[0], y - c[1]))) : Infinity;
      if (d > bestD) {
        best = c;
        bestD = d;
      }
      if (d >= gap * 1.4) break;
    }
    placed.push(best);
    out[p] = best;
  }
  return out;
}
