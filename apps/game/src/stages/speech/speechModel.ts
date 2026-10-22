/**
 * The new general's speech without pictures: which slips lie on the desk, which went into the speech, and
 * what the speech was. Kept free of Pixi and the DOM so it can be tested.
 */
import type { SpeechFragment, SpeechKind } from '../../content/speechFragments.ts';

/** Slips on the desk (keys 1–9) and lines in a speech: it is short. */
export const SLIPS = 9;
export const MAX_LINES = 4;
/** Seconds to put it together («без таймера»: none), and when the old general prompts. */
export const SPEECH_SECONDS = 45;
export const NUDGE_AT = 12;
export const WAIT_AT = 26;
export const COUNTDOWN = 10;

/** Which kinds the desk deals, slip by slip: Крыпоткин's words and the truth most, then orders, one silence. */
const DEAL: readonly Exclude<SpeechKind, 'mixed'>[] = ['hollow', 'truth', 'order', 'hollow', 'truth', 'silence', 'hollow', 'order', 'truth'];

/**
 * Up to SLIPS fragments, as the desk deals them: by kind in the DEAL pattern (a kind that has run out gives its
 * place to the next that hasn't), picked and laid out at random.
 */
export function deal(fragments: readonly SpeechFragment[], rng: () => number): SpeechFragment[] {
  const pools = new Map<string, SpeechFragment[]>();
  for (const f of fragments) {
    const pool = pools.get(f.kind) ?? [];
    pool.push(f);
    pools.set(f.kind, pool);
  }
  for (const pool of pools.values()) shuffle(pool, rng);
  const out: SpeechFragment[] = [];
  const kinds = [...DEAL];
  for (let i = 0; out.length < SLIPS && out.length < fragments.length; i++) {
    const kind = kinds[i % kinds.length]!;
    const f = pools.get(kind)?.pop() ?? [...pools.values()].find((p) => p.length)?.pop();
    if (f) out.push(f);
  }
  return shuffle(out, rng);
}

/** What the speech mostly was: a kind with more than half its lines, else mixed; nothing said is silence. */
export function speechKind(lines: readonly Pick<SpeechFragment, 'kind'>[]): SpeechKind {
  if (!lines.length) return 'silence';
  const count = new Map<string, number>();
  for (const l of lines) count.set(l.kind, (count.get(l.kind) ?? 0) + 1);
  for (const [kind, n] of count) if (n * 2 > lines.length) return kind as SpeechKind;
  return 'mixed';
}

/** The slips on the desk and the speech being put together from them. */
export class SpeechDraft {
  readonly slips: readonly SpeechFragment[];
  readonly lines: SpeechFragment[] = [];

  constructor(slips: readonly SpeechFragment[]) {
    this.slips = slips;
  }

  /** The slip at index i (0-based) goes to the end of the speech; false if it is gone already or the speech is full. */
  pick(i: number): boolean {
    const f = this.slips[i];
    if (!f || this.lines.includes(f) || this.full) return false;
    this.lines.push(f);
    return true;
  }

  /** Takes the last line back to the desk. */
  unpick(): SpeechFragment | null {
    return this.lines.pop() ?? null;
  }

  taken(i: number): boolean {
    const f = this.slips[i];
    return !!f && this.lines.includes(f);
  }

  get full(): boolean {
    return this.lines.length >= MAX_LINES;
  }

  result(): { kind: SpeechKind; lines: string[] } {
    return { kind: speechKind(this.lines), lines: this.lines.map((l) => l.text) };
  }
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}
