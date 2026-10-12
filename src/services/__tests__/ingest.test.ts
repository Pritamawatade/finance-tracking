import { eq } from 'drizzle-orm';
import { ensureSeeded } from '../../db/seed';
import { accounts, merchantRules, transactions } from '../../db/schema';
import { findRuleFor } from '../../repositories/rules';
import { getCategoryByName } from '../../repositories/categories';
import {
  ingestInboxItems,
  type InboxItemLike,
} from '../ingest';
import { createTestDb } from '../../test-utils/testDb';

const RECEIVED_AT = Date.parse('2026-10-06T12:00:00+05:30');

function debitItem(overrides: Partial<InboxItemLike> = {}): InboxItemLike {
  return {
    smsHash: 'hash-vikas-1',
    sender: 'AX-EQUTAS-S',
    body: 'INR 30.00 debited from Equitas-2825 via UPI -Ref:627951725402 to Vikas Munshilal on 06-10-26.Bal INR 864.45',
    receivedAt: RECEIVED_AT,
    parsed: {
      templateId: 'equitas-debit-v1',
      direction: 'debit',
      amountMinor: 3000,
      accountLast4: '2825',
      bankName: 'Equitas',
      reference: '627951725402',
      counterparty: 'Vikas Munshilal',
      description: null,
      channel: 'upi',
      txnDate: '2026-10-06',
      balanceAfterMinor: 86445,
      lowConfidence: false,
    },
    state: 'pending',
    categoryId: null,
    ...overrides,
  };
}

function setup() {
  const { db } = createTestDb();
  expect(ensureSeeded(db)).toBe(true);
  expect(ensureSeeded(db)).toBe(false); // idempotent seed
  const food = getCategoryByName(db, 'Food & Dining', 'expense');
  const salary = getCategoryByName(db, 'Salary', 'income');
  if (!food || !salary) throw new Error('seed failed');
  return { db, food, salary };
}

describe('ingest: idempotency', () => {
  test('run twice → one sms row + one transaction row', () => {
    const { db } = setup();
    const first = ingestInboxItems(db, [debitItem()]);
    expect(first).toMatchObject({ inserted: 1, upgraded: 0 });
    const second = ingestInboxItems(db, [debitItem()]);
    expect(second).toMatchObject({ inserted: 0, upgraded: 0, skipped: 1 });
    expect(db.select().from(transactions).all()).toHaveLength(1);
  });

  test('same reference from a second SMS body still dedupes', () => {
    const { db } = setup();
    ingestInboxItems(db, [debitItem()]);
    ingestInboxItems(db, [
      debitItem({ smsHash: 'hash-vikas-2', body: 'duplicate resend' }),
    ]);
    expect(db.select().from(transactions).all()).toHaveLength(1);
  });
});

describe('ingest: conflict rules', () => {
  test('pending → confirmed upgrades; ledger confirmed wins over later pending', () => {
    const { db, food } = setup();
    ingestInboxItems(db, [debitItem()]);
    const upgrade = ingestInboxItems(db, [
      debitItem({ state: 'confirmed', categoryId: food.id }),
    ]);
    expect(upgrade.upgraded).toBe(1);
    const row = db.select().from(transactions).all()[0];
    expect(row.status).toBe('confirmed');
    expect(row.categoryId).toBe(food.id);

    // A later pending delivery must not clobber the confirmation.
    const late = ingestInboxItems(db, [debitItem()]);
    expect(late).toMatchObject({ inserted: 0, upgraded: 0 });
    expect(db.select().from(transactions).all()[0].status).toBe('confirmed');
  });

  test('confirmed first, then ignored keeps confirmed (ledger wins)', () => {
    const { db, food } = setup();
    ingestInboxItems(db, [
      debitItem({ state: 'confirmed', categoryId: food.id }),
    ]);
    ingestInboxItems(db, [debitItem({ state: 'ignored' })]);
    expect(db.select().from(transactions).all()[0].status).toBe('confirmed');
  });

  test('pending → ignored upgrades', () => {
    const { db } = setup();
    ingestInboxItems(db, [debitItem()]);
    const r = ingestInboxItems(db, [debitItem({ state: 'ignored' })]);
    expect(r.upgraded).toBe(1);
    expect(db.select().from(transactions).all()[0].status).toBe('ignored');
  });

  test('auto_confirmed maps to confirmed', () => {
    const { db, food } = setup();
    ingestInboxItems(db, [
      debitItem({ state: 'auto_confirmed', categoryId: food.id }),
    ]);
    expect(db.select().from(transactions).all()[0].status).toBe('confirmed');
  });
});

describe('ingest: accounts + rules + validation', () => {
  test('auto-creates Equitas ••2825 and stores latest balance', () => {
    const { db } = setup();
    ingestInboxItems(db, [debitItem()]);
    const accs = db.select().from(accounts).all();
    const eq = accs.find((a) => a.last4 === '2825');
    expect(eq).toMatchObject({
      name: 'Equitas ••2825',
      bankName: 'Equitas',
      latestBalanceMinor: 86445,
      latestBalanceAt: RECEIVED_AT,
    });
    // Cash seed account still present.
    expect(accs.some((a) => a.type === 'cash')).toBe(true);
  });

  test('older balance SMS does not overwrite newer balance', () => {
    const { db } = setup();
    ingestInboxItems(db, [debitItem()]);
    ingestInboxItems(db, [
      debitItem({
        smsHash: 'hash-vikas-3',
        receivedAt: RECEIVED_AT - 1000,
        parsed: {
          ...(debitItem().parsed as NonNullable<InboxItemLike['parsed']>),
          reference: '627951725499',
          balanceAfterMinor: 100,
        },
      }),
    ]);
    const eq = db
      .select()
      .from(accounts)
      .all()
      .find((a) => a.last4 === '2825');
    expect(eq?.latestBalanceMinor).toBe(86445);
  });

  test('learns exact merchant rule on confirmed with category', () => {
    const { db, food } = setup();
    ingestInboxItems(db, [
      debitItem({ state: 'confirmed', categoryId: food.id }),
    ]);
    const rule = findRuleFor(db, 'vikas munshilal', 'debit');
    expect(rule).toMatchObject({
      matchType: 'exact',
      categoryId: food.id,
    });
    expect(db.select().from(merchantRules).all().length).toBeGreaterThan(1);
  });

  test('charge SMS (no counterparty) keys off description; seed rule matches', () => {
    const { db } = setup();
    const fees = getCategoryByName(db, 'Fees & Charges', 'expense');
    if (!fees) throw new Error('seed rule category missing');
    ingestInboxItems(db, [
      debitItem({
        smsHash: 'hash-chgs-1',
        body: 'charge sms',
        receivedAt: RECEIVED_AT,
        state: 'pending',
        categoryId: null,
        parsed: {
          templateId: 'equitas-debit-v1',
          direction: 'debit',
          amountMinor: 673,
          accountLast4: '2825',
          bankName: 'Equitas',
          reference: null,
          counterparty: null,
          description: 'SMS ALRT CHGS+GST:300926/263641980',
          channel: 'other',
          txnDate: '2026-10-02',
          balanceAfterMinor: 9445,
          lowConfidence: false,
        },
      }),
    ]);
    const row = db
      .select()
      .from(transactions)
      .where(eq(transactions.dedupeKey, 'sms:hash-chgs-1'))
      .get();
    expect(row?.counterpartyKey).toContain('chgs');
    // Seed contains/chgs/debit rule resolves it to Fees & Charges.
    expect(findRuleFor(db, row?.counterpartyKey ?? '', 'debit')).toMatchObject(
      { categoryId: fees.id, autoConfirm: 1 },
    );
  });

  test('direction↔kind mismatch drops the category instead of failing', () => {
    const { db, salary } = setup();
    ingestInboxItems(db, [
      debitItem({ state: 'confirmed', categoryId: salary.id }),
    ]);
    expect(db.select().from(transactions).all()[0].categoryId).toBeNull();
  });

  test('unparsed SMS stores the message but no transaction', () => {
    const { db } = setup();
    const summary = ingestInboxItems(db, [
      { ...debitItem(), parsed: null },
    ]);
    expect(summary).toMatchObject({ inserted: 0, skipped: 1 });
    expect(db.select().from(transactions).all()).toHaveLength(0);
  });
});
