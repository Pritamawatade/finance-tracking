import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { merchantRules } from '../db/schema';
import type { AppDb } from '../db/types';
import { useUiStore } from '../store/uiStore';

const ruleInput = z.object({
  matchType: z.enum(['exact', 'contains']).default('exact'),
  matchKey: z.string().trim().min(1).max(120),
  direction: z.enum(['debit', 'credit', 'any']).default('any'),
  categoryId: z.number().int().positive(),
  autoConfirm: z.number().int().min(0).max(1).default(0),
});

export type RuleInput = z.input<typeof ruleInput>;
export type RuleDirection = 'debit' | 'credit' | 'any';

/**
 * Upsert on (match_type, match_key, direction): set category, bump
 * hit_count, refresh last_used_at. Normalizes the key (spec §7.4).
 */
export function upsertMerchantRule(db: AppDb, input: RuleInput) {
  const v = ruleInput.parse(input);
  const key = normalizeKey(v.matchKey);
  const now = Date.now();
  db.insert(merchantRules)
    .values({
      matchType: v.matchType,
      matchKey: key,
      direction: v.direction,
      categoryId: v.categoryId,
      autoConfirm: v.autoConfirm,
      hitCount: 1,
      lastUsedAt: now,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [
        merchantRules.matchType,
        merchantRules.matchKey,
        merchantRules.direction,
      ],
      set: {
        categoryId: v.categoryId,
        autoConfirm: v.autoConfirm,
        hitCount: sql`${merchantRules.hitCount} + 1`,
        lastUsedAt: now,
      },
    })
    .run();
  useUiStore.getState().bump();
  return getRule(db, v.matchType, key, v.direction);
}

function getRule(
  db: AppDb,
  matchType: 'exact' | 'contains',
  matchKey: string,
  direction: RuleDirection,
) {
  const rows = db.select().from(merchantRules).all();
  return (
    rows.find(
      (r) =>
        r.matchType === matchType &&
        r.matchKey === matchKey &&
        r.direction === direction,
    ) ?? null
  );
}

/**
 * Find the best rule for a normalized counterparty key + direction.
 * Exact matches win; otherwise the longest matching `contains` key wins;
 * ties break by hit_count. Direction 'any' rules apply to both.
 */
export function findRuleFor(
  db: AppDb,
  counterpartyKey: string,
  direction: 'debit' | 'credit',
) {
  const key = normalizeKey(counterpartyKey);
  if (!key) return null;
  const candidates = db
    .select()
    .from(merchantRules)
    .orderBy(desc(merchantRules.hitCount))
    .all()
    .filter((r) => r.direction === direction || r.direction === 'any');
  const exact = candidates.filter(
    (r) => r.matchType === 'exact' && r.matchKey === key,
  );
  if (exact.length > 0) return exact[0];
  const contains = candidates
    .filter((r) => r.matchType === 'contains' && key.includes(r.matchKey))
    .sort((a, b) => b.matchKey.length - a.matchKey.length);
  return contains[0] ?? null;
}

export function listRules(db: AppDb) {
  return db
    .select()
    .from(merchantRules)
    .orderBy(desc(merchantRules.lastUsedAt))
    .all();
}

export function setAutoConfirm(
  db: AppDb,
  id: number,
  autoConfirm: 0 | 1,
): void {
  db
    .update(merchantRules)
    .set({ autoConfirm })
    .where(eq(merchantRules.id, id))
    .run();
  useUiStore.getState().bump();
}

export function deleteRule(db: AppDb, id: number): void {
  db.delete(merchantRules).where(eq(merchantRules.id, id)).run();
  useUiStore.getState().bump();
}

/** Spec §7.4 counterparty normalization (shared with ingest). */
export function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
