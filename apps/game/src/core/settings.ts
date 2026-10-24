/** Per-viewer settings, kept apart from the save so «Начать с построения» doesn't touch them. */

export type Output = 'headphones' | 'speakers' | 'mono';

/** Physical key → the game key it stands for (engine/keys.ts). Empty: every key is itself. */
export type KeyMap = Record<string, string>;

export interface Settings {
  output: Output;
  largeText: boolean;
  reduceFlashes: boolean;
  /** «Без таймера»: every timed decision waits for the player (concept «Доступность»). */
  noTimer: boolean;
  /** Captions for every signal and sound, with side and distance. Defaults on unless headphones. */
  captions: boolean | null;
  /** «Подсказки слепого режима»: the partner's lines marked «это твой», the smell drawn as clear sectors. */
  blindHints: boolean;
  /** 0..1 each; 1 is the game as mixed. */
  volume: { master: number; music: number; effects: number };
  keys: KeyMap;
}

const KEY = 'lda.settings';

export const DEFAULT_SETTINGS: Settings = {
  output: 'headphones',
  largeText: false,
  reduceFlashes: false,
  noTimer: false,
  captions: null,
  blindHints: false,
  volume: { master: 1, music: 1, effects: 1 },
  keys: {},
};

/** Sound captions are on when asked for, or by default when the player listens without headphones. */
export function captionsOn(s: Settings): boolean {
  return s.captions ?? s.output !== 'headphones';
}

const unit = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);
const CODE = /^[A-Za-z][A-Za-z0-9]{0,23}$/;

/** Settings as stored, with every field this version doesn't know filled in from the defaults. */
export function parseSettings(raw: string | null | undefined): Settings {
  if (!raw) return structuredClone(DEFAULT_SETTINGS);
  try {
    const s = JSON.parse(raw) as Partial<Settings>;
    const v: Partial<Settings['volume']> = typeof s.volume === 'object' && s.volume ? s.volume : {};
    const keys: KeyMap = {};
    if (s.keys && typeof s.keys === 'object') for (const [k, g] of Object.entries(s.keys)) if (CODE.test(k) && typeof g === 'string' && CODE.test(g) && k !== g) keys[k] = g;
    return {
      output: s.output === 'speakers' || s.output === 'mono' ? s.output : 'headphones',
      largeText: s.largeText === true,
      reduceFlashes: s.reduceFlashes === true,
      noTimer: s.noTimer === true,
      captions: typeof s.captions === 'boolean' ? s.captions : null,
      blindHints: s.blindHints === true,
      volume: { master: unit(v.master, 1), music: unit(v.music, 1), effects: unit(v.effects, 1) },
      keys,
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function loadSettings(store: Pick<Storage, 'getItem'> | null): Settings {
  try {
    return parseSettings(store?.getItem(KEY));
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(store: Pick<Storage, 'setItem'> | null, s: Settings): void {
  try {
    store?.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode: settings last until the tab closes.
  }
}

// ---------- changes while playing ----------

const listeners = new Set<(s: Settings) => void>();

/** Called whenever the player changes a setting (the panel, in any place); returns the unsubscribe. */
export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * After the settings object was changed in place: saves it and tells whoever listens (main.ts applies large
 * text, volumes and output; stages read their fields live, so they see the same object).
 */
export function settingsChanged(s: Settings): void {
  let store: Storage | null = null;
  try {
    store = window.localStorage;
  } catch {
    store = null;
  }
  saveSettings(store, s);
  for (const fn of listeners) fn(s);
}
