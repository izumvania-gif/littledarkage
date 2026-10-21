/**
 * The save: one key holding both layers, plus a backup of the previous write.
 * - run: this playthrough (reset by «Начать с построения»), with a battle in progress saved after every turn;
 * - memory: what outlives playthroughs, such as the names crossed out in the register.
 * Bump SAVE_SCHEMA and add a migration in parseSave when the shape changes.
 */
import { MAX_HP, type Battle } from './battle.ts';
import { isSceneId, type SceneId } from '../content/scenes.ts';

export const SAVE_SCHEMA = 3;
export const SAVE_KEY = 'lda.save';
export const BACKUP_KEY = 'lda.save.bak';

export type Gender = 'm' | 'f';

/** What a battle carries besides the field; saved with it. */
export interface BattleMemory {
  /** The partner's trust in the player, 0..3 (from the barracks; the battle moves it). */
  trust: number;
  /** The partner was hit or cried out last turn, so his quirks are on (visible to the player). */
  partnerScared: boolean;
  /** The player (as striker) was hit last turn: their coordinator is scared too. */
  playerScared: boolean;
  /** Counters for the register and the stats: crushed, secrets, caught, accepted, followed, ignored… */
  stats: Record<string, number>;
}

/** A battle in progress: it can't be rewound, so it is saved after every turn and resumed as it was. */
export interface BattleSave {
  id: string;
  state: Battle;
  memory: BattleMemory;
}

export interface RunState {
  name: string;
  gender: Gender;
  /** The scene the player is in; it plays from its start on load. */
  scene: SceneId;
  /** The soldier's one pool of hits for the whole game, in any seat. */
  hp: number;
  /** Named soldiers' trust in the player, 0..3. */
  trust: Record<string, number>;
  /** What the player did and chose, as the script names it («named_self», «rumour_public»…). */
  flags: string[];
  /** The player's replies home, by letter number; they never arrive, and the finale reads them out. */
  replies: Record<string, string>;
  battle: BattleSave | null;
}

export interface Memory {
  /** Names of past soldiers, oldest first: crossed out in the register and refused at the lineup. */
  names: string[];
}

export interface SaveFile {
  schema: typeof SAVE_SCHEMA;
  /** Grows with every write, so a stale tab or backup can be told from the latest. */
  generation: number;
  run: RunState | null;
  memory: Memory;
}

export type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

export function freshSave(): SaveFile {
  return { schema: SAVE_SCHEMA, generation: 0, run: null, memory: { names: [] } };
}

/** A new soldier at the lineup. */
export function newRun(name: string, gender: Gender): RunState {
  return { name, gender, scene: 'workshop', hp: MAX_HP, trust: { norkin: 1 }, flags: [], replies: {}, battle: null };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function parseBattle(v: unknown): BattleSave | null {
  if (!isObject(v) || typeof v.id !== 'string' || !isObject(v.state) || !isObject(v.memory)) return null;
  const st = v.state;
  const m = v.memory;
  if (typeof st.turn !== 'number' || typeof st.rng !== 'number' || !Array.isArray(st.units) || !Array.isArray(st.coords) || !Array.isArray(st.creatures)) return null;
  if (typeof m.trust !== 'number' || !isObject(m.stats)) return null;
  return v as unknown as BattleSave;
}

/** A run of any schema, migrated to the current one; a battle that doesn't load restarts from its start (null). */
function parseRun(v: unknown): RunState | null {
  if (!isObject(v) || typeof v.name !== 'string' || (v.gender !== 'm' && v.gender !== 'f')) return null;
  // Schemas 1–2 kept a story stage instead of a scene: registered → the workshop, trained → after it.
  const scene: SceneId = isSceneId(v.scene) ? v.scene : v.stage === 'trained' ? 'amateur' : 'workshop';
  const hp = typeof v.hp === 'number' && v.hp >= 0 && v.hp <= MAX_HP ? v.hp : MAX_HP;
  const trust: Record<string, number> = { norkin: 1 };
  if (isObject(v.trust)) for (const [k, t] of Object.entries(v.trust)) if (typeof t === 'number') trust[k] = Math.max(0, Math.min(3, t));
  const flags = Array.isArray(v.flags) ? v.flags.filter((f): f is string => typeof f === 'string') : [];
  const replies: Record<string, string> = {};
  if (isObject(v.replies)) for (const [k, r] of Object.entries(v.replies)) if (typeof r === 'string') replies[k] = r;
  return { name: v.name, gender: v.gender, scene, hp, trust, flags, replies, battle: parseBattle(v.battle) };
}

export function parseSave(raw: string | null): SaveFile | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const s = data as { schema?: unknown; generation?: unknown; run?: unknown; memory?: { names?: unknown } };
  // Older schemas had runs without hits, trust, battles or scenes; parseRun fills them in.
  if (!s || typeof s.schema !== 'number' || s.schema < 1 || s.schema > SAVE_SCHEMA || typeof s.generation !== 'number') return null;
  const names = Array.isArray(s.memory?.names) ? s.memory.names.filter((n): n is string => typeof n === 'string') : [];
  return { schema: SAVE_SCHEMA, generation: s.generation, run: parseRun(s.run), memory: { names } };
}

/** The main key, else the backup, else a fresh save. Storage may be missing or throw (private mode). */
export function loadSave(store: KeyValue | null): SaveFile {
  if (!store) return freshSave();
  try {
    return parseSave(store.getItem(SAVE_KEY)) ?? parseSave(store.getItem(BACKUP_KEY)) ?? freshSave();
  } catch {
    return freshSave();
  }
}

/** Keeps the previous save as the backup, then writes the new one. Returns false when storage refused. */
export function writeSave(store: KeyValue | null, save: SaveFile): boolean {
  if (!store) return false;
  try {
    const previous = store.getItem(SAVE_KEY);
    if (previous) store.setItem(BACKUP_KEY, previous);
    save.generation += 1;
    store.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/** Ends the current run: its soldier goes into the register as a crossed-out name. */
export function retireRun(save: SaveFile): SaveFile {
  const names = [...save.memory.names];
  if (save.run && !names.includes(save.run.name)) names.push(save.run.name);
  return { ...save, run: null, memory: { ...save.memory, names } };
}
