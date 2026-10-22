/**
 * Staging from the script: `#do:<action>` tags, parsed here and carried out by the scene runner before the
 * line they come with. Kept as a tiny grammar so a typo in the script fails a test instead of a scene.
 */
export type Facing = 'left' | 'right';
export type Light = 'warm' | 'disco' | 'dark' | 'alarm';
export type TrackName = 'concert' | 'disco' | 'tape' | 'concert2' | 'concert3' | 'riot';
export type Sound = 'stomp' | 'siren' | 'click' | 'bell';

export type Action =
  | { kind: 'show'; ids: string[] }
  | { kind: 'place'; id: string; at: string; facing?: Facing; pose?: string }
  | { kind: 'walk'; id: string; to: string }
  | { kind: 'pose'; id: string; pose: string }
  | { kind: 'face'; id: string; facing: Facing }
  | { kind: 'light'; light: Light }
  | { kind: 'music'; track: TrackName }
  | { kind: 'musicStop'; click: boolean }
  | { kind: 'sfx'; sound: Sound }
  | { kind: 'clap' }
  | { kind: 'letterShow'; n: number; reader: string }
  | { kind: 'letterOpen'; n: number }
  | { kind: 'letterReply'; n: number }
  | { kind: 'pause'; ms: number }
  /** A duty right here in the scene: the sofa (with a partner), the leaves, the pen (blind in cycle 2). */
  | { kind: 'duty'; duty: 'sofa' | 'leaves' | 'pen'; partner?: string }
  /** The player, named general, puts the speech together (stages/speech); its kind comes back as a flag. */
  | { kind: 'assemble' }
  /** The general's peaked cap goes to this face (the new general). */
  | { kind: 'cap'; id: string }
  /** The box with the creature taken alive: shown or taken away. */
  | { kind: 'box'; on: boolean };

const LIGHTS: readonly Light[] = ['warm', 'disco', 'dark', 'alarm'];
const TRACKS: readonly TrackName[] = ['concert', 'disco', 'tape', 'concert2', 'concert3', 'riot'];
const SOUNDS: readonly Sound[] = ['stomp', 'siren', 'click', 'bell'];
const isFacing = (v: string | undefined): v is Facing => v === 'left' || v === 'right';

export function parseAction(src: string): Action | null {
  const [kind = '', a = '', b = '', c = '', d = ''] = src.split(':').map((s) => s.trim());
  const n = Number(a);
  switch (kind) {
    case 'show':
      return a ? { kind, ids: a.split(',').map((s) => s.trim()).filter(Boolean) } : null;
    case 'place':
      if (!a || !b || (c && !isFacing(c))) return null;
      return { kind, id: a, at: b, ...(isFacing(c) ? { facing: c } : {}), ...(d ? { pose: d } : {}) };
    case 'walk':
      return a && b ? { kind, id: a, to: b } : null;
    case 'pose':
      return a && b ? { kind, id: a, pose: b } : null;
    case 'face':
      return a && isFacing(b) ? { kind, id: a, facing: b } : null;
    case 'light':
      return (LIGHTS as readonly string[]).includes(a) ? { kind, light: a as Light } : null;
    case 'music':
      if (a === 'stop' || a === 'stop-click') return { kind: 'musicStop', click: a === 'stop-click' };
      return (TRACKS as readonly string[]).includes(a) ? { kind, track: a as TrackName } : null;
    case 'sfx':
      return (SOUNDS as readonly string[]).includes(a) ? { kind, sound: a as Sound } : null;
    case 'clap':
      return { kind };
    case 'letter_show':
      return Number.isInteger(n) && b ? { kind: 'letterShow', n, reader: b } : null;
    case 'letter_open':
      return Number.isInteger(n) && n > 0 ? { kind: 'letterOpen', n } : null;
    case 'letter_reply':
      return Number.isInteger(n) && n > 0 ? { kind: 'letterReply', n } : null;
    case 'pause':
      return Number.isFinite(n) && n >= 0 ? { kind, ms: n } : null;
    case 'duty':
      if (a !== 'sofa' && a !== 'leaves' && a !== 'pen') return null;
      return { kind, duty: a, ...(b ? { partner: b } : {}) };
    case 'assemble':
      return { kind };
    case 'cap':
      return a ? { kind, id: a } : null;
    case 'box':
      return a === 'on' || a === 'off' ? { kind, on: a === 'on' } : null;
    default:
      return null;
  }
}

/** The character ids an action names, for checking the script against the cast. */
export function actors(a: Action): string[] {
  switch (a.kind) {
    case 'show':
      return a.ids;
    case 'place':
    case 'walk':
    case 'pose':
    case 'face':
      return [a.id];
    case 'letterShow':
      return [a.reader];
    case 'duty':
      return a.partner ? [a.partner] : [];
    case 'cap':
      return [a.id];
    default:
      return [];
  }
}
