import { eq } from 'drizzle-orm';
import { appSettings } from '../db/schema';
import type { AppDb } from '../db/types';
import { useUiStore } from '../store/uiStore';

export function getSetting(db: AppDb, key: string, fallback = ''): string {
  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get();
  return row ? row.value : fallback;
}

export function getAllSettings(db: AppDb): Record<string, string> {
  const rows = db.select().from(appSettings).all();
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function setSetting(db: AppDb, key: string, value: string): void {
  const now = Date.now();
  db.insert(appSettings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: now },
    })
    .run();
  useUiStore.getState().bump();
}
