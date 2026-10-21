/**
 * The save: one key holding both layers, plus a backup of the previous write.
 * - run: this playthrough (reset by «Начать с построения»);
 * - memory: what outlives playthroughs, such as the names crossed out in the register.
 * Bump SAVE_SCHEMA and add a migration in parseSave when the shape changes.
 */

export const SAVE_SCHEMA = 1;
export const SAVE_KEY = 'lda.save';
export const BACKUP_KEY = 'lda.save.bak';

export type Gender = 'm' | 'f';

export interface RunState {
  name: string;
  gender: Gender;
  stage: 'registered';
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

function isRun(v: unknown): v is RunState {
  const r = v as RunState;
  return !!r && typeof r.name === 'string' && (r.gender === 'm' || r.gender === 'f') && r.stage === 'registered';
}

export function parseSave(raw: string | null): SaveFile | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const s = data as Partial<SaveFile>;
  if (!s || s.schema !== SAVE_SCHEMA || typeof s.generation !== 'number') return null;
  const names = Array.isArray(s.memory?.names) ? s.memory.names.filter((n): n is string => typeof n === 'string') : [];
  return { schema: SAVE_SCHEMA, generation: s.generation, run: isRun(s.run) ? s.run : null, memory: { names } };
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
