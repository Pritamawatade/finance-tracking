import { eq } from 'drizzle-orm';
import { categories, smsMessages, transactions } from '../db/schema';
import type { AppDb } from '../db/types';
import {
  resolveAccount,
  updateBalanceIfNewer,
} from '../repositories/accounts';
import { upsertMerchantRule } from '../repositories/rules';
import { useUiStore } from '../store/uiStore';

/** Mirror of the native `ParsedTxn` (§6.3), defined locally (no native import). */
export interface ParsedTxnLike {
  templateId: string;
  direction: 'debit' | 'credit';
  amountMinor: number;
  accountLast4: string | null;
  /** Bank name for account resolution (from the matched template). */
  bankName?: string | null;
  reference: string | null;
  counterparty: string | null;
  description: string | null;
  channel: 'upi' | 'other';
  /** 'YYYY-MM-DD' from the SMS body. */
  txnDate: string;
  balanceAfterMinor: number | null;
  lowConfidence: boolean;
}

/** Mirror of the native `InboxItem` (§6.3), defined locally. */
export interface InboxItemLike {
  smsHash: string;
  sender: string;
  body: string;
  receivedAt: number;
  parsed: ParsedTxnLike | null;
  state: 'pending' | 'confirmed' | 'auto_confirmed' | 'ignored';
  categoryId: number | null;
}

export type LedgerStatus = 'pending' | 'confirmed' | 'ignored';

export function mapStateToStatus(
  state: InboxItemLike['state'],
): LedgerStatus {
  if (state === 'confirmed' || state === 'auto_confirmed') return 'confirmed';
  if (state === 'ignored') return 'ignored';
  return 'pending';
}

/** Spec §7.4: dedupe key — `ref:<reference>` else `sms:<smsHash>`. */
export function dedupeKeyFor(
  reference: string | null,
  smsHash: string,
): string {
  return reference ? `ref:${reference}` : `sms:${smsHash}`;
}

/** Spec §7.4 counterparty normalization. */
export function normalizeCounterparty(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface IngestSummary {
  smsUpserted: number;
  inserted: number;
  upgraded: number;
  skipped: number;
}

function channelFor(
  parsed: ParsedTxnLike,
): 'upi' | 'imps' | 'neft' | 'card' | 'atm' | 'cash' | 'other' {
  return parsed.channel === 'upi' ? 'upi' : 'other';
}

/**
 * Spec §9.3 — idempotent ingest in one DB transaction:
 * - upsert `sms_messages` by `sms_hash`
 * - resolve/create account by (bank_name, last4)
 * - insert or upgrade transaction keyed by `dedupe_key`
 * - conflict rule: ledger `confirmed`/`ignored` wins over `pending`;
 *   a `pending` ledger row can be upgraded by incoming confirmed/ignored
 * - learn a merchant rule on confirmed-with-category
 */
export function ingestInboxItems(
  db: AppDb,
  items: InboxItemLike[],
): IngestSummary {
  const summary: IngestSummary = {
    smsUpserted: 0,
    inserted: 0,
    upgraded: 0,
    skipped: 0,
  };
  if (items.length === 0) return summary;

  (db as AppDb).transaction((tx) => {
    const t = tx as AppDb;
    for (const item of items) {
      ingestOne(t, item, summary);
    }
  });

  if (summary.smsUpserted + summary.inserted + summary.upgraded > 0) {
    useUiStore.getState().bump();
  }
  return summary;
}

function ingestOne(db: AppDb, item: InboxItemLike, summary: IngestSummary) {
  const now = Date.now();
  const status = mapStateToStatus(item.state);
  const parseStatus =
    item.state === 'ignored'
      ? ('ignored' as const)
      : item.parsed
        ? ('parsed' as const)
        : ('unparsed' as const);

  db.insert(smsMessages)
    .values({
      smsHash: item.smsHash,
      sender: item.sender,
      body: item.body,
      receivedAt: item.receivedAt,
      parseStatus,
      templateId: item.parsed?.templateId ?? null,
      createdAt: now,
    })
    .onConflictDoNothing()
    .run();
  summary.smsUpserted += 1;

  const smsRow = db
    .select()
    .from(smsMessages)
    .where(eq(smsMessages.smsHash, item.smsHash))
    .get();
  if (!smsRow || !item.parsed) {
    summary.skipped += 1;
    return;
  }
  const parsed = item.parsed;

  const account = resolveAccount(
    db,
    parsed.bankName ?? null,
    parsed.accountLast4,
  );
  updateBalanceIfNewer(
    db,
    account.id,
    parsed.balanceAfterMinor,
    item.receivedAt,
  );

  const dedupeKey = dedupeKeyFor(parsed.reference, item.smsHash);
  // Charges etc. have no counterparty — fall back to the description so
  // rules like contains/chgs can still match and learn.
  const nameSource = parsed.counterparty ?? parsed.description ?? null;
  const counterpartyKey = nameSource
    ? normalizeCounterparty(nameSource)
    : null;

  // Validate the suggested category against direction↔kind; drop on mismatch.
  let categoryId = item.categoryId;
  if (categoryId != null) {
    const cat = db
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId))
      .get();
    const ok =
      cat != null &&
      (cat.kind === 'neutral' ||
        (parsed.direction === 'debit' && cat.kind === 'expense') ||
        (parsed.direction === 'credit' && cat.kind === 'income'));
    if (!ok) categoryId = null;
  }

  const existing = db
    .select()
    .from(transactions)
    .where(eq(transactions.dedupeKey, dedupeKey))
    .get();

  if (existing) {
    if (existing.status === 'confirmed' || existing.status === 'ignored') {
      // Ledger wins — keep the user's resolution.
      summary.skipped += 1;
      return;
    }
    // Pending ledger row: upgrade on incoming confirmed/ignored.
    if (status === 'confirmed' || status === 'ignored') {
      db.update(transactions)
        .set({
          status,
          categoryId: categoryId ?? existing.categoryId,
          updatedAt: now,
        })
        .where(eq(transactions.id, existing.id))
        .run();
      summary.upgraded += 1;
      if (status === 'confirmed') {
        learn(db, parsed.direction, categoryId ?? existing.categoryId, counterpartyKey);
      }
    } else {
      summary.skipped += 1;
    }
    return;
  }

  db.insert(transactions)
    .values({
      accountId: account.id,
      categoryId,
      direction: parsed.direction,
      amountMinor: parsed.amountMinor,
      currency: 'INR',
      occurredAt: item.receivedAt,
      localDate: parsed.txnDate,
      status,
      counterpartyName: nameSource,
      counterpartyKey,
      channel: channelFor(parsed),
      reference: parsed.reference,
      description: parsed.description,
      note: null,
      balanceAfterMinor: parsed.balanceAfterMinor,
      source: 'sms',
      smsMessageId: smsRow.id,
      dedupeKey,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  summary.inserted += 1;
  if (status === 'confirmed') {
    learn(db, parsed.direction, categoryId, counterpartyKey);
  }
}

/** Spec §9.4 — learn exact merchant rule on confirmation with a category. */
function learn(
  db: AppDb,
  direction: 'debit' | 'credit',
  categoryId: number | null,
  counterpartyKey: string | null,
) {
  if (categoryId == null || !counterpartyKey) return;
  upsertMerchantRule(db, {
    matchType: 'exact',
    matchKey: counterpartyKey,
    direction,
    categoryId,
    autoConfirm: 0,
  });
}
