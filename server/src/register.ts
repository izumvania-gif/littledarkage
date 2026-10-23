// The shared register (concept §7 «Общая книга учёта»): how many recruits have arrived across all barracks, and
// what share of finished runs did this or that. Both start from the world's own numbers, as Eferon's cycle
// counter started at 1472, so the first player never sees an empty book or a share of one.

/** «Новобранцев прибыло» before any player: the first name makes it 4 817, the concept's example. */
export const ARRIVED_FIRST = 4816;

/** The shares the register shows, in this order. Must match RegisterStat['key'] in apps/game/src/net/api.ts. */
export const STAT_KEYS = ['covered', 'krypotkinKill', 'recon', 'caught', 'mutiny', 'general', 'lineup', 'newGeneral', 'emptyWall'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const ENDINGS = ['lineup', 'newGeneral', 'emptyWall'] as const;
export const SPEECHES = ['truth', 'hollow', 'order', 'silence', 'mixed'] as const;

/** The world's own finished runs, added to the real ones (41% covered, 23% helped Крыпоткин, as in the concept). */
export const BASELINE: Readonly<Record<StatKey | 'runs', number>> = {
  runs: 400,
  covered: 164,
  krypotkinKill: 92,
  recon: 180,
  caught: 120,
  mutiny: 96,
  general: 132,
  lineup: 328,
  newGeneral: 40,
  emptyWall: 32,
};

/** What a finished run reports. Must match RunReport in apps/game/src/net/api.ts. */
export interface RunReport {
  ending: (typeof ENDINGS)[number];
  covered: boolean;
  krypotkinKill: boolean;
  recon: boolean;
  caught: boolean;
  mutiny: boolean;
  general: boolean;
  speech: (typeof SPEECHES)[number] | null;
  returned: number;
}

const FLAGS = ['covered', 'krypotkinKill', 'recon', 'caught', 'mutiny', 'general'] as const;

/** The report if every field has the right type and value (extra keys are ignored), else null. */
export function validateRun(body: unknown): RunReport | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (!(ENDINGS as readonly unknown[]).includes(b.ending)) return null;
  if (!FLAGS.every((k) => typeof b[k] === 'boolean')) return null;
  if (b.speech !== null && !(SPEECHES as readonly unknown[]).includes(b.speech)) return null;
  if (typeof b.returned !== 'number' || !Number.isInteger(b.returned) || b.returned < 0 || b.returned > 2) return null;
  return {
    ending: b.ending as RunReport['ending'],
    covered: b.covered as boolean,
    krypotkinKill: b.krypotkinKill as boolean,
    recon: b.recon as boolean,
    caught: b.caught as boolean,
    mutiny: b.mutiny as boolean,
    general: b.general as boolean,
    speech: b.speech as RunReport['speech'],
    returned: b.returned,
  };
}

/** The counters a run adds to: `runs`, every yes, its ending, its speech and how many times the player came back. */
export function runCounters(r: RunReport): string[] {
  const out = ['runs', r.ending, `returned_${r.returned}`];
  for (const k of FLAGS) if (r[k]) out.push(k);
  if (r.speech) out.push(`speech_${r.speech}`);
  return out;
}

/** Shares in percent, the baseline included. `counts` holds the real counters by name (missing = 0). */
export function shares(counts: Readonly<Record<string, number>>): { key: StatKey; percent: number }[] {
  const runs = BASELINE.runs + (counts.runs ?? 0);
  return STAT_KEYS.map((key) => ({ key, percent: Math.round((100 * (BASELINE[key] + (counts[key] ?? 0))) / runs) }));
}
