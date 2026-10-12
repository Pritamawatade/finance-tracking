import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';
import migrations from './migrations/migrations';

/**
 * Main DB handle (`finance.db`). Opens with WAL + foreign keys enforced.
 * Wrapped in try/catch so importing this module on web (or in Node) does not
 * crash at import time — `getDb()` throws a clear error instead.
 */

export type AppExpoDb = ExpoSQLiteDatabase<typeof schema>;

/** useMigrations-compatible bundle (pass to `useMigrations(db, migrations)`). */
export { migrations };
export default migrations;

let cached: AppExpoDb | null = null;
let openError: unknown = null;

function open(): AppExpoDb {
  const native = openDatabaseSync('finance.db');
  native.execSync('PRAGMA journal_mode = WAL;');
  native.execSync('PRAGMA foreign_keys = ON;');
  return drizzle(native, { schema });
}

try {
  cached = open();
} catch (e) {
  // Web / Node: no native sqlite module. Defer the failure to getDb().
  openError = e;
}

export function getDb(): AppExpoDb {
  if (cached) return cached;
  try {
    cached = open();
    return cached;
  } catch (e) {
    throw new Error(
      `expo-sqlite database unavailable: ${(e ?? openError) instanceof Error ? ((e ?? openError) as Error).message : String(e ?? openError)}`,
    );
  }
}
