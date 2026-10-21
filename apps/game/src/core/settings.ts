/** Per-viewer settings, kept apart from the save so «Начать с построения» doesn't touch them. */

export type Output = 'headphones' | 'speakers' | 'mono';

export interface Settings {
  output: Output;
  largeText: boolean;
  reduceFlashes: boolean;
  /** «Без таймера»: every timed decision waits for the player (concept «Доступность»). */
  noTimer: boolean;
  /** Captions for every signal and sound, with side and distance. Defaults on unless headphones. */
  captions: boolean | null;
}

const KEY = 'lda.settings';

export const DEFAULT_SETTINGS: Settings = { output: 'headphones', largeText: false, reduceFlashes: false, noTimer: false, captions: null };

/** Sound captions are on when asked for, or by default when the player listens without headphones. */
export function captionsOn(s: Settings): boolean {
  return s.captions ?? s.output !== 'headphones';
}

export function loadSettings(store: Pick<Storage, 'getItem'> | null): Settings {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      output: s.output === 'speakers' || s.output === 'mono' ? s.output : 'headphones',
      largeText: s.largeText === true,
      reduceFlashes: s.reduceFlashes === true,
      noTimer: s.noTimer === true,
      captions: typeof s.captions === 'boolean' ? s.captions : null,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(store: Pick<Storage, 'setItem'> | null, s: Settings): void {
  try {
    store?.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode: settings last until the tab closes.
  }
}
