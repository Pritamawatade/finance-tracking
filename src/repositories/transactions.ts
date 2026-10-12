import { and, desc, eq, gte, inArray, like, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { categories, transactions } from '../db/schema';
import type { AppDb } from '../db/types';
import { useUiStore } from '../store/uiStore';

export const CHANNELS = [
  'upi',
  'imps',
  'neft',
  'card',
  'atm',
  'cash',
  'other',
] as const;

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const transactionInput = z.object({
  accountId: z.number().int().positive(),
  categoryId: z.number().int().positive().nullable().optional(),
  direction: z.enum(['debit', 'credit']),
  amountMinor: z.number().int().positive(),
  currency: z.string().default('INR'),
  occurredAt: z.number().int(),
  localDate,
  status: z.enum(['pending', 'confirmed', 'ignored']).default('confirmed'),
  counterpartyName: z.string().max(200).nullable().optional(),
  counterpartyKey: z.string().max(200).nullable().optional(),
  channel: z.enum(CHANNELS).nullable().optional(),
  reference: z.string().max(80).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  balanceAfterMinor: z.number().int().nullable().optional(),
  source: z.enum(['sms', 'manual']),
  smsMessageId: z.number().int().positive().nullable().optional(),
  dedupeKey: z.string().max(120).nullable().optional(),
});

const transactionPatch = transactionInput
  .omit({ dedupeKey: true })
  .partial();

export type TransactionInput = z.input<typeof transactionInput>;
export type TransactionPatch = z.input<typeof transactionPatch>;

export interface TransactionFilters {
  from?: string;
  to?: string;
  categoryIds?: number[];
  accountId?: number | null;
  direction?: 'debit' | 'credit' | null;
  query?: string;
  source?: 'sms' | 'manual' | null;
  status?: 'pending' | 'confirmed' | 'ignored' | null;
}

/**
 * Spec §8.1: debit → expense|neutral, credit → income|neutral.
 * NULL category (Uncategorized) is always allowed.
 */
export function assertDirectionKind(
  db: AppDb,
  direction: 'debit' | 'credit',
  categoryId: number | null | undefined,
): void {
  if (categoryId == null) return;
  const cat = db
    .select()
    .from(categories)
    .where(eq(categories.id, categoryId))
    .get();
  if (!cat) throw new Error(`category ${categoryId} not found`);
  if (cat.kind === 'neutral') return;
  if (direction === 'debit' && cat.kind !== 'expense') {
    throw new Error(`debit transactions need an expense category (got ${cat.kind})`);
  }
  if (direction === 'credit' && cat.kind !== 'income') {
    throw new Error(`credit transactions need an income category (got ${cat.kind})`);
  }
}

function toRow(v: z.output<typeof transactionInput>, now: number) {
  return {
    accountId: v.accountId,
    categoryId: v.categoryId ?? null,
    direction: v.direction,
    amountMinor: v.amountMinor,
    currency: v.currency,
    occurredAt: v.occurredAt,
    localDate: v.localDate,
    status: v.status,
    counterpartyName: v.counterpartyName ?? null,
    counterpartyKey: v.counterpartyKey ?? null,
    channel: v.channel ?? null,
    reference: v.reference ?? null,
    description: v.description ?? null,
    note: v.note ?? null,
    balanceAfterMinor: v.balanceAfterMinor ?? null,
    source: v.source,
    smsMessageId: v.smsMessageId ?? null,
    dedupeKey: v.dedupeKey ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createTransaction(db: AppDb, input: TransactionInput) {
  const v = transactionInput.parse(input);
  assertDirectionKind(db, v.direction, v.categoryId ?? null);
  const now = Date.now();
  db.insert(transactions).values(toRow(v, now)).run();
  useUiStore.getState().bump();
  if (v.dedupeKey) return getTransactionByDedupeKey(db, v.dedupeKey);
  const rows = db
    .select()
    .from(transactions)
    .orderBy(desc(transactions.id))
    .limit(1)
    .all();
  return rows[0] ?? null;
}

export function updateTransaction(
  db: AppDb,
  id: number,
  patch: TransactionPatch,
) {
  const v = transactionPatch.parse(patch);
  const existing = getTransaction(db, id);
  if (!existing) throw new Error(`transaction ${id} not found`);
  const direction = v.direction ?? existing.direction;
  const categoryId =
    v.categoryId !== undefined ? v.categoryId : existing.categoryId;
  assertDirectionKind(db, direction, categoryId ?? null);
  const { ...rest } = v;
  db.update(transactions)
    .set({ ...rest, updatedAt: Date.now() })
    .where(eq(transactions.id, id))
    .run();
  useUiStore.getState().bump();
  return getTransaction(db, id);
}

/** Hard delete is allowed for transactions (spec §8.1 restricts categories). */
export function deleteTransaction(db: AppDb, id: number): void {
  db.delete(transactions).where(eq(transactions.id, id)).run();
  useUiStore.getState().bump();
}

export function getTransaction(db: AppDb, id: number) {
  return (
    db.select().from(transactions).where(eq(transactions.id, id)).get() ?? null
  );
}

export function getTransactionByDedupeKey(db: AppDb, dedupeKey: string) {
  return (
    db
      .select()
      .from(transactions)
      .where(eq(transactions.dedupeKey, dedupeKey))
      .get() ?? null
  );
}

export function listTransactions(db: AppDb, filters: TransactionFilters = {}) {
  const conds = [];
  if (filters.from) conds.push(gte(transactions.localDate, filters.from));
  if (filters.to) conds.push(lt(transactions.localDate, filters.to));
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    conds.push(inArray(transactions.categoryId, filters.categoryIds));
  }
  if (filters.accountId != null) {
    conds.push(eq(transactions.accountId, filters.accountId));
  }
  if (filters.direction) {
    conds.push(eq(transactions.direction, filters.direction));
  }
  if (filters.source) {
    conds.push(eq(transactions.source, filters.source));
  }
  if (filters.status) {
    conds.push(eq(transactions.status, filters.status));
  }
  const q = (filters.query ?? '').trim();
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, '')}%`;
    conds.push(
      or(
        like(transactions.counterpartyName, pattern),
        like(transactions.note, pattern),
        like(transactions.description, pattern),
      ),
    );
  }
  const base = db
    .select()
    .from(transactions)
    .orderBy(desc(transactions.localDate), desc(transactions.id));
  return (conds.length > 0 ? base.where(and(...conds)) : base).all();
}

export function countPending(db: AppDb): number {
  const rows = db.all<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM transactions WHERE status = 'pending'`,
  );
  return rows[0]?.n ?? 0;
}
