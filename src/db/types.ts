import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import type * as schema from './schema';

/**
 * Database handle type shared by app code (expo-sqlite) and Node tests
 * (better-sqlite3). All repositories/services only use the query-builder API
 * surface common to both drivers, so they accept either.
 */
export type AppDb =
  | BetterSQLite3Database<typeof schema>
  | ExpoSQLiteDatabase<typeof schema>;
