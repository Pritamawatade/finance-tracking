import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { accounts } from '../db/schema';
import type { AppDb } from '../db/types';
import { useUiStore } from '../store/uiStore';

const accountInput = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(['bank', 'cash', 'wallet', 'credit_card']).default('bank'),
  bankName: z.string().max(80).nullable().optional(),
  last4: z
    .string()
    .regex(/^\d{3,4}$/)
    .nullable()
    .optional(),
  currency: z.string().default('INR'),
});

const accountPatch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  isArchived: z.number().int().min(0).max(1).optional(),
});

export type AccountInput = z.input<typeof accountInput>;
export type AccountPatch = z.input<typeof accountPatch>;

export function listAccounts(db: AppDb, includeArchived = false) {
  const rows = db.select().from(accounts).orderBy(asc(accounts.id)).all();
  return includeArchived ? rows : rows.filter((r) => r.isArchived === 0);
}

export function getAccount(db: AppDb, id: number) {
  return db.select().from(accounts).where(eq(accounts.id, id)).get() ?? null;
}

export function createAccount(db: AppDb, input: AccountInput) {
  const v = accountInput.parse(input);
  db.insert(accounts)
    .values({
      name: v.name,
      type: v.type,
      bankName: v.bankName ?? null,
      last4: v.last4 ?? null,
      currency: v.currency,
      latestBalanceMinor: null,
      latestBalanceAt: null,
      isArchived: 0,
      createdAt: Date.now(),
    })
    .run();
  useUiStore.getState().bump();
  const rows = db.select().from(accounts).all();
  const row = rows.find(
    (r) => r.name === v.name && (r.bankName ?? null) === (v.bankName ?? null),
  );
  if (!row) throw new Error('createAccount: insert failed');
  return row;
}

export function updateAccount(db: AppDb, id: number, patch: AccountPatch) {
  const v = accountPatch.parse(patch);
  db.update(accounts).set(v).where(eq(accounts.id, id)).run();
  useUiStore.getState().bump();
  const updated = getAccount(db, id);
  if (!updated) throw new Error(`account ${id} not found`);
  return updated;
}

export function getAccountByBankLast4(
  db: AppDb,
  bankName: string | null,
  last4: string | null,
) {
  if (last4 == null) return null;
  const rows = db.select().from(accounts).all();
  if (bankName == null) {
    return (
      rows.find((r) => r.last4 === last4 && r.bankName == null) ?? null
    );
  }
  return (
    rows.find((r) => r.last4 === last4 && r.bankName === bankName) ?? null
  );
}

/**
 * Spec §8.5: find account by (bank_name, last4); create "<Bank> ••<last4>"
 * when missing. Pass bankName=null for sender-derived accounts without a
 * known bank.
 */
export function resolveAccount(
  db: AppDb,
  bankName: string | null,
  last4: string | null,
) {
  const existing = getAccountByBankLast4(db, bankName, last4);
  if (existing) return existing;
  const label = last4 ? ` ••${last4}` : '';
  return createAccount(db, {
    name: `${bankName ?? 'Account'}${label}`,
    type: 'bank',
    bankName,
    last4,
  });
}

/** Update latest balance only when the SMS is newer than stored (§8.5). */
export function updateBalanceIfNewer(
  db: AppDb,
  accountId: number,
  balanceMinor: number | null,
  balanceAt: number,
): void {
  if (balanceMinor == null) return;
  const acc = getAccount(db, accountId);
  if (!acc) return;
  if (acc.latestBalanceAt == null || balanceAt > acc.latestBalanceAt) {
    db.update(accounts)
      .set({ latestBalanceMinor: balanceMinor, latestBalanceAt: balanceAt })
      .where(eq(accounts.id, accountId))
      .run();
    useUiStore.getState().bump();
  }
}

export function findCashAccount(db: AppDb) {
  const rows = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.type, 'cash'), isNull(accounts.last4)))
    .all();
  return rows[0] ?? null;
}
