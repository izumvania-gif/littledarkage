/**
 * The online layer (concept §7 «Онлайн-слой»): asynchronous only, and the game works without it. Every call
 * gives up after a few seconds and returns null, so a server that is down or slow looks like a quiet one.
 * Nothing personal leaves the browser: the register only counts names, a finished run reports a handful of
 * yes/no answers, and a reply home goes to the box of undelivered letters only when the player puts it there.
 */

/** A server that hangs is treated like one that is down: the game never waits on it for long. */
const timeout = () => AbortSignal.timeout(4000);

/** The ending of a run, as stages/finale names it. */
export type EndingName = 'lineup' | 'newGeneral' | 'emptyWall';
export type SpeechName = 'truth' | 'hollow' | 'order' | 'silence' | 'mixed';

/** What a finished run tells the shared register: yes/no answers only, no names, no text. */
export interface RunReport {
  ending: EndingName;
  /** The player took a blow for the partner at least once as coordinator. */
  covered: boolean;
  /** Крыпоткин crushed his creature in battle 3. */
  krypotkinKill: boolean;
  /** Went down the far tunnel with Седой. */
  recon: boolean;
  /** Took a creature alive with the sack. */
  caught: boolean;
  /** Proposed «мы не пойдём». */
  mutiny: boolean;
  /** Was named the new general, and what speech they gave (null if not general). */
  general: boolean;
  speech: SpeechName | null;
  /** How many times the player came back under a new name (0–2). */
  returned: number;
}

/** A share of finished runs, all barracks together, the world's own count included (so it never looks empty). */
export interface RegisterStat {
  key: 'covered' | 'krypotkinKill' | 'recon' | 'caught' | 'mutiny' | 'general' | 'lineup' | 'newGeneral' | 'emptyWall';
  /** 0–100, rounded. */
  percent: number;
}

export interface RegisterResponse {
  /** «Новобранцев прибыло»: the world's count plus every name every player has given. */
  arrived: number;
  stats: RegisterStat[];
}

/** A player's reply home that reached the box of undelivered letters after moderation. */
export interface BoxLetter {
  id: number;
  /** «Кому» on the triangle: one of LETTER_ADDRESSEES. */
  to: string;
  text: string;
}

/** Who a reply home may be addressed to on the box's triangles (the server accepts only these). */
export const LETTER_ADDRESSEES = ['Домой', 'Маме', 'Отцу', 'Сестре', 'Брату', 'Другу', 'Подруге', 'Любимой', 'Любимому', 'Незнакомому защитнику', 'Незнакомой женщине'] as const;

/** The same limit the server checks. */
export const MAX_LETTER_LENGTH = 600;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: timeout() });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function post(url: string, body?: unknown): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: 'POST',
      signal: timeout(),
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    return null;
  }
}

/** The shared register: how many recruits have arrived, and what the barracks did. Null offline. */
export function fetchRegister(): Promise<RegisterResponse | null> {
  return getJson<RegisterResponse>('/api/register');
}

/** One more name in the shared register (a roll call, a return under a new name). Returns the new count or null. */
export async function reportArrival(): Promise<number | null> {
  const res = await post('/api/register/arrived');
  if (!res || (!res.ok && res.status !== 429)) return null;
  try {
    return ((await res.json()) as { arrived: number }).arrived;
  } catch {
    return null;
  }
}

/** A finished run's yes/no answers, for the shares. Fire and forget. */
export async function reportRun(report: RunReport): Promise<boolean> {
  const res = await post('/api/runs', report);
  return !!res?.ok;
}

/** Up to `n` approved letters from other players for the box. Null offline. */
export async function fetchBoxLetters(n = 6): Promise<BoxLetter[] | null> {
  const r = await getJson<{ letters: BoxLetter[] }>(`/api/letters?n=${n}`);
  return r?.letters ?? null;
}

/**
 * Puts a reply in the box. Premoderated: 'ok' means it went in, never that anyone will read it — the player is
 * not told either way. 'wait' — too soon after the last one; 'invalid' — the filter refused it; null — offline.
 */
export async function postBoxLetter(to: string, text: string): Promise<'ok' | 'wait' | 'invalid' | null> {
  const res = await post('/api/letters', { to, text });
  if (!res) return null;
  if (res.status === 429) return 'wait';
  if (res.status === 400) return 'invalid';
  return res.ok ? 'ok' : null;
}
