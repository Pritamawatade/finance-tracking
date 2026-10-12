import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { categories } from '../db/schema';
import type { AppDb } from '../db/types';
import { useUiStore } from '../store/uiStore';

const categoryInput = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['expense', 'income', 'neutral']),
  icon: z.string().min(1).max(12),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  sortOrder: z.number().int().default(0),
});

const categoryPatch = categoryInput.partial();

export type CategoryInput = z.input<typeof categoryInput>;
export type CategoryPatch = z.input<typeof categoryPatch>;

export function listCategories(db: AppDb, includeArchived = false) {
  const rows = db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.id))
    .all();
  return includeArchived ? rows : rows.filter((r) => r.isArchived === 0);
}

export function getCategory(db: AppDb, id: number) {
  return (
    db.select().from(categories).where(eq(categories.id, id)).get() ?? null
  );
}

export function getCategoryByName(
  db: AppDb,
  name: string,
  kind: 'expense' | 'income' | 'neutral',
) {
  const rows = db.select().from(categories).all();
  return rows.find((r) => r.name === name && r.kind === kind) ?? null;
}

export function createCategory(db: AppDb, input: CategoryInput) {
  const v = categoryInput.parse(input);
  // System / Transfer-style names are guarded by unique (name, kind).
  db.insert(categories)
    .values({ ...v, isSystem: 0, isArchived: 0, createdAt: Date.now() })
    .run();
  useUiStore.getState().bump();
  const row = getCategoryByName(db, v.name, v.kind);
  if (!row) throw new Error('createCategory: insert failed');
  return row;
}

export function updateCategory(
  db: AppDb,
  id: number,
  patch: CategoryPatch,
) {
  const v = categoryPatch.parse(patch);
  const existing = getCategory(db, id);
  if (!existing) throw new Error(`category ${id} not found`);
  if (existing.isSystem === 1 && (v.name !== undefined || v.kind !== undefined)) {
    throw new Error('system categories cannot be renamed');
  }
  db.update(categories).set(v).where(eq(categories.id, id)).run();
  useUiStore.getState().bump();
  const updated = getCategory(db, id);
  if (!updated) throw new Error(`category ${id} not found after update`);
  return updated;
}

/** Soft-delete. Hard delete only after reassigning transactions (FK RESTRICT). */
export function archiveCategory(db: AppDb, id: number): void {
  const existing = getCategory(db, id);
  if (!existing) throw new Error(`category ${id} not found`);
  if (existing.isSystem === 1) throw new Error('system categories cannot be deleted');
  db.update(categories).set({ isArchived: 1 }).where(eq(categories.id, id)).run();
  useUiStore.getState().bump();
}

export function unarchiveCategory(db: AppDb, id: number): void {
  db.update(categories).set({ isArchived: 0 }).where(eq(categories.id, id)).run();
  useUiStore.getState().bump();
}
