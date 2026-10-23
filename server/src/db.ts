import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { LetterStatus } from './letters.ts';
import { ARRIVED_FIRST } from './register.ts';

export interface StoredLetter {
  id: number;
  to: string;
  text: string;
}

export interface Store {
  /** «Новобранцев прибыло»: the world's count plus every name counted. */
  getArrived(): number;
  /** One more name; returns the new count. */
  recordArrival(): number;
  /** Adds one to each of these counters at once (a finished run: see runCounters). */
  bump(counters: readonly string[]): void;
  /** Every counter by name (`arrived`, `runs`, `covered`, `lineup`…). */
  counters(): Record<string, number>;
  addLetter(to: string, text: string): number;
  /** Up to `n` random approved letters among the latest thousand, so old ones slowly leave the box. */
  randomApprovedLetters(n: number): StoredLetter[];
  lettersByStatus(status: LetterStatus, limit: number): (StoredLetter & { createdAt: number })[];
  setLetterStatus(id: number, status: LetterStatus): boolean;
  close(): void;
}

/**
 * Opens (or creates) the SQLite database at `$dataDir/littledarkage.sqlite`; ':memory:' for tests. Only counters
 * and letters are kept: no names, no IP addresses, nothing per player.
 */
export function openStore(dataDir: string | ':memory:'): Store {
  let path = ':memory:';
  if (dataDir !== ':memory:') {
    mkdirSync(dataDir, { recursive: true });
    path = join(dataDir, 'littledarkage.sqlite');
  }
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS counters (
      name  TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS letters (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      addressee  TEXT NOT NULL,
      text       TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS letters_status ON letters (status, id);
  `);

  const bumpOne = db.prepare(
    `INSERT INTO counters (name, value) VALUES (?, 1) ON CONFLICT (name) DO UPDATE SET value = value + 1 RETURNING value`,
  );
  const selectOne = db.prepare(`SELECT value FROM counters WHERE name = ?`);
  const selectAll = db.prepare(`SELECT name, value FROM counters`);

  const insertLetter = db.prepare(`INSERT INTO letters (addressee, text, created_at) VALUES (?, ?, ?) RETURNING id`);
  const sampleLetters = db.prepare(`
    SELECT id, addressee AS "to", text FROM (SELECT id, addressee, text FROM letters WHERE status = 'approved' ORDER BY id DESC LIMIT 1000)
    ORDER BY random() LIMIT ?`);
  const listLetters = db.prepare(
    `SELECT id, addressee AS "to", text, created_at AS createdAt FROM letters WHERE status = ? ORDER BY id LIMIT ?`,
  );
  const updateLetter = db.prepare(`UPDATE letters SET status = ? WHERE id = ?`);

  const arrived = () => Number((selectOne.get('arrived') as { value: number } | undefined)?.value ?? 0);

  return {
    getArrived: () => ARRIVED_FIRST + arrived(),
    recordArrival: () => ARRIVED_FIRST + Number((bumpOne.get('arrived') as { value: number }).value),
    bump: (names) => {
      db.exec('BEGIN');
      try {
        for (const n of names) bumpOne.get(n);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    counters: () => Object.fromEntries((selectAll.all() as { name: string; value: number }[]).map((r) => [r.name, Number(r.value)])),
    addLetter: (to, text) => Number((insertLetter.get(to, text, Date.now()) as { id: number }).id),
    randomApprovedLetters: (n) => (sampleLetters.all(n) as unknown as StoredLetter[]).map((r) => ({ id: Number(r.id), to: r.to, text: r.text })),
    lettersByStatus: (status, limit) =>
      (listLetters.all(status, limit) as unknown as (StoredLetter & { createdAt: number })[]).map((r) => ({
        id: Number(r.id),
        to: r.to,
        text: r.text,
        createdAt: Number(r.createdAt),
      })),
    setLetterStatus: (id, status) => Number(updateLetter.run(status, id).changes) > 0,
    close: () => db.close(),
  };
}
