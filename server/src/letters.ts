// The box of undelivered letters (concept §7 «Письма без адресата»): players' replies home, put there only by
// their own choice, and shown to others only after an admin approves them (premoderation). The filter below just
// stops the obvious before a letter queues; moderation is the real filter.

/** «Кому» on a triangle. Must match LETTER_ADDRESSEES in apps/game/src/net/api.ts. */
export const LETTER_ADDRESSEES = ['Домой', 'Маме', 'Отцу', 'Сестре', 'Брату', 'Другу', 'Подруге', 'Любимой', 'Любимому', 'Незнакомому защитнику', 'Незнакомой женщине'] as const;

/** Must match MAX_LETTER_LENGTH in apps/game/src/net/api.ts. */
export const MAX_LETTER_LENGTH = 600;
const MIN_LETTER_LENGTH = 2;

export type LetterStatus = 'pending' | 'approved' | 'rejected';
export const LETTER_STATUSES: readonly LetterStatus[] = ['pending', 'approved', 'rejected'];

/** Letters, digits, spaces and line breaks, and the punctuation a letter home needs. No slashes, no @. */
const ALLOWED = /^[\p{Script=Cyrillic}A-Za-z0-9\s.,;:!?'"«»„“”’()\-—–…№%+=*]+$/u;

/**
 * What the filter refuses outright: links and contacts (a letter is not an advert), and the strongest
 * obscenities in Russian and English, by root. Kept short on purpose; word-start roots avoid catching
 * ordinary words («страхуем», «употреблять»).
 */
const BLOCKED: readonly RegExp[] = [
  /https?:/i,
  /www\./i,
  /\.(ru|su|com|net|org|io|me|info|xyz|ly|tk|рф)(?![\p{L}\p{N}])/iu,
  /@[\p{L}\p{N}_]/u,
  /(\d[\s\-()]*){7,}/,
  /(?<!\p{L})ху[йеёия]/iu,
  /пизд/iu,
  /(?<!\p{L})[её]б[аеёилнуы]/iu,
  /(?<!\p{L})бля(?:[дт]|(?!\p{L}))/iu,
  /муда[кч]/iu,
  /пид[оа]р/iu,
  /fuck|shit|cunt|nigg|faggot/i,
];

/** The cleaned letter text, or null if it can't be accepted at all. */
export function cleanLetter(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const t = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (t.length < MIN_LETTER_LENGTH || t.length > MAX_LETTER_LENGTH) return null;
  if (!ALLOWED.test(t)) return null;
  if (BLOCKED.some((re) => re.test(t))) return null;
  return t;
}

export function isAddressee(to: unknown): to is (typeof LETTER_ADDRESSEES)[number] {
  return typeof to === 'string' && (LETTER_ADDRESSEES as readonly string[]).includes(to);
}
