import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DDL_STATEMENTS } from './ddl.js';

/**
 * The whole app runs on one local SQLite database file. Default location is
 * `data/insights.db` in the working directory (the repo root for both `next
 * dev` and the `tsx` scripts); override with `INSIGHTS_DB_PATH`. The file (and
 * its `-wal`/`-shm` siblings) is gitignored — back it up with Time Machine or
 * by copying the file.
 */
export const DEFAULT_DB_PATH = 'data/insights.db';

export function resolveDbPath(): string {
  return process.env.INSIGHTS_DB_PATH || DEFAULT_DB_PATH;
}

const globalForDb = globalThis as unknown as { __insightsDb?: Database.Database };

export function getDb(): Database.Database {
  if (globalForDb.__insightsDb) return globalForDb.__insightsDb;

  const path = resolveDbPath();
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });

  const db = new Database(path);
  // WAL lets the dev server read while the pipeline script writes, and vice
  // versa; busy_timeout rides out the rare writer contention between them.
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  for (const statement of DDL_STATEMENTS) db.exec(statement);

  globalForDb.__insightsDb = db;
  return db;
}
