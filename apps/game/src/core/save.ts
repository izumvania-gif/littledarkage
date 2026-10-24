/**
 * The save: one key holding both layers, plus a backup of the previous write.
 * - run: this playthrough (reset by «Начать с построения»), with a battle in progress saved after every turn;
 * - memory: what outlives playthroughs, such as the names crossed out in the register.
 * Bump SAVE_SCHEMA and add a migration in parseSave when the shape changes.
 */
import { MAX_HP, type Battle } from './battle.ts';
import { dative } from './names.ts';
import { FACES, MAX_RANK, newRoster, PLAYER_FACE, type Roster } from './service.ts';
import { isSceneId, type SceneId } from '../content/scenes.ts';

export const SAVE_SCHEMA = 5;
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
  /** Who serves under which name and rank, by face (core/service.ts); the player is `player`. */
  roster: Roster;
  /** The general's draws (ranks, the new general) come from it, so a replayed muster announces the same. */
  seed: number;
  /** The new general named at the third muster: a face or `player`. */
  general: string | null;
  /** The player's earlier names in this run, after falling in battle and coming back under a new one. */
  formerNames: string[];
  /** The current name in the dative, as the player confirmed it for the triangles («Кому: Петровой»). */
  dative: string;
}

/** A line of the register: a soldier's name and what the book says of them. */
export interface RegisterRecord {
  name: string;
  note: string;
}

export interface Memory {
  /** Names of past soldiers, oldest first: crossed out in the register and refused at the lineup. */
  names: string[];
  /** The register's lines for those names, as the finale wrote them. */
  records: RegisterRecord[];
  /** The name given in the finale's lineup: the next playthrough's roll call starts with it. */
  nextName: { name: string; gender: Gender } | null;
  /** Endings seen, oldest first. */
  endings: string[];
}

export interface SaveFile {
  schema: typeof SAVE_SCHEMA;
  /** Grows with every write, so a stale tab or backup can be told from the latest. */
  generation: number;
  run: RunState | null;
  memory: Memory;
}

export type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

/** Set when another tab has taken the game over (core/tabs.ts): this one must not write any more. */
let readOnly = false;
export function setSaveReadOnly(v: boolean): void {
  readOnly = v;
}

export function freshSave(): SaveFile {
  return { schema: SAVE_SCHEMA, generation: 0, run: null, memory: { names: [], records: [], nextName: null, endings: [] } };
}

/** A new soldier at the lineup. */
export function newRun(name: string, gender: Gender, seed = Math.floor(Math.random() * 1e9)): RunState {
  return { name, gender, scene: 'workshop', hp: MAX_HP, trust: { norkin: 1 }, flags: [], replies: {}, battle: null, roster: newRoster(name), seed, general: null, formerNames: [], dative: dative(name, gender === 'f') };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** A roster as saved, else a fresh one (schemas 1–3 had none: everyone still under their first name). */
function parseRoster(v: unknown, name: string): Roster {
  const roster = newRoster(name);
  if (!isObject(v)) return roster;
  for (const face of [PLAYER_FACE, ...FACES]) {
    const s = v[face];
    if (!isObject(s) || typeof s.name !== 'string' || typeof s.rank !== 'number' || typeof s.since !== 'number' || typeof s.life !== 'number') continue;
    roster[face] = { name: s.name, rank: Math.max(0, Math.min(MAX_RANK, s.rank)), since: s.since, life: s.life };
  }
  roster[PLAYER_FACE]!.name = name;
  return roster;
}

/** A stable seed for runs saved before there was one. */
function seedOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

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
  const flags = strings(v.flags);
  const replies: Record<string, string> = {};
  if (isObject(v.replies)) for (const [k, r] of Object.entries(v.replies)) if (typeof r === 'string') replies[k] = r;
  return {
    name: v.name,
    gender: v.gender,
    scene,
    hp,
    trust,
    flags,
    replies,
    battle: parseBattle(v.battle),
    roster: parseRoster(v.roster, v.name),
    seed: typeof v.seed === 'number' ? v.seed : seedOf(v.name),
    general: typeof v.general === 'string' ? v.general : null,
    formerNames: strings(v.formerNames),
    // Schemas 1–4 had no confirmed form: the guessed one stands in.
    dative: typeof v.dative === 'string' && v.dative.trim() ? v.dative : dative(v.name, v.gender === 'f'),
  };
}

function parseMemory(v: unknown): Memory {
  const m = isObject(v) ? v : {};
  const records = Array.isArray(m.records)
    ? m.records.filter((r): r is RegisterRecord => isObject(r) && typeof r.name === 'string' && typeof r.note === 'string').map((r) => ({ name: r.name, note: r.note }))
    : [];
  const n = isObject(m.nextName) ? m.nextName : {};
  const next = typeof n.name === 'string' && (n.gender === 'm' || n.gender === 'f') ? { name: n.name, gender: n.gender as Gender } : null;
  return { names: strings(m.names), records, nextName: next, endings: strings(m.endings) };
}

export function parseSave(raw: string | null): SaveFile | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const s = data as { schema?: unknown; generation?: unknown; run?: unknown; memory?: unknown };
  // Older schemas had runs without hits, trust, battles, scenes or the roster; parseRun fills them in.
  if (!s || typeof s.schema !== 'number' || s.schema < 1 || s.schema > SAVE_SCHEMA || typeof s.generation !== 'number') return null;
  return { schema: SAVE_SCHEMA, generation: s.generation, run: parseRun(s.run), memory: parseMemory(s.memory) };
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
  if (!store || readOnly) return false;
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

/**
 * Ends the current run: its soldier, under every name they went by, goes into the register crossed out, with the
 * finale's notes when there are any. `next` is the name given in the finale's lineup, for the next roll call.
 */
export function retireRun(save: SaveFile, opts: { records?: readonly RegisterRecord[]; ending?: string; next?: Memory['nextName'] } = {}): SaveFile {
  const names = [...save.memory.names];
  const records = [...save.memory.records];
  const run = save.run;
  const theirs = run ? [...run.formerNames, run.name] : [];
  for (const name of theirs) {
    if (names.includes(name)) continue;
    names.push(name);
    records.push(opts.records?.find((r) => r.name === name) ?? { name, note: '' });
  }
  const endings = opts.ending ? [...save.memory.endings, opts.ending] : save.memory.endings;
  return { ...save, run: null, memory: { names, records, nextName: opts.next ?? null, endings } };
}
