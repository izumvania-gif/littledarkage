/** Per-viewer settings, kept apart from the save so «Начать с построения» doesn't touch them. */

export type Output = 'headphones' | 'speakers' | 'mono';

export interface Settings {
  output: Output;
  largeText: boolean;
  reduceFlashes: boolean;
}

const KEY = 'lda.settings';

export const DEFAULT_SETTINGS: Settings = { output: 'headphones', largeText: false, reduceFlashes: false };

export function loadSettings(store: Pick<Storage, 'getItem'> | null): Settings {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      output: s.output === 'speakers' || s.output === 'mono' ? s.output : 'headphones',
      largeText: s.largeText === true,
      reduceFlashes: s.reduceFlashes === true,
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
