import { createTestDb } from '../../test-utils/testDb';
import {
  getCategoryBreakdown,
  getDailySeries,
  getMonthlySeries,
  getPendingCount,
  getTopPayees,
  getTotals,
  getWeeklySeries,
  zeroFillDaily,
  zeroFillMonthly,
  zeroFillWeekly,
} from '../reports';

const NOW = 1760150400000; // 2026-10-11T00:00:00Z

function seed() {
  const { sqlite, db } = createTestDb();
  sqlite.exec(`
    INSERT INTO categories (id, name, kind, icon, color, sort_order, is_system, is_archived, created_at)
    VALUES (1, 'Food & Dining', 'expense', '🍔', '#F97316', 0, 0, 0, ${NOW}),
           (2, 'Transport & Fuel', 'expense', '🚌', '#0EA5E9', 1, 0, 0, ${NOW}),
           (3, 'Salary', 'income', '💼', '#22C55E', 2, 0, 0, ${NOW}),
           (4, 'Transfer', 'neutral', '↔️', '#64748B', 3, 1, 0, ${NOW});
    INSERT INTO accounts (id, name, type, bank_name, last4, currency, latest_balance_minor, latest_balance_at, is_archived, created_at)
    VALUES (1, 'Equitas ••2825', 'bank', 'Equitas', '2825', 'INR', NULL, NULL, 0, ${NOW});
    INSERT INTO transactions
      (id, account_id, category_id, direction, amount_minor, currency, occurred_at, local_date, status,
       counterparty_name, counterparty_key, channel, reference, description, note, balance_after_minor,
       source, sms_message_id, dedupe_key, created_at, updated_at)
    VALUES
      (1, 1, 1, 'debit', 3000, 'INR', ${NOW}, '2026-10-06', 'confirmed', 'Vikas Munshilal', 'vikas munshilal', 'upi', '627951725402', NULL, NULL, 86445, 'sms', NULL, 'ref:627951725402', ${NOW}, ${NOW}),
      (2, 1, 1, 'debit', 500, 'INR', ${NOW}, '2026-10-06', 'confirmed', 'Vikas Munshilal', 'vikas munshilal', 'upi', '627951725403', NULL, NULL, NULL, 'sms', NULL, 'ref:627951725403', ${NOW}, ${NOW}),
      (3, 1, 2, 'debit', 1200, 'INR', ${NOW}, '2026-10-10', 'confirmed', 'Uber', 'uber', 'upi', '627951725404', NULL, NULL, NULL, 'sms', NULL, 'ref:627951725404', ${NOW}, ${NOW}),
      (4, 1, 3, 'credit', 250000, 'INR', ${NOW}, '2026-10-11', 'confirmed', 'SANYOG NANASAH', 'sanyog nanasah', 'upi', '867186099240', NULL, NULL, 336445, 'sms', NULL, 'ref:867186099240', ${NOW}, ${NOW}),
      (5, 1, 1, 'debit', 9999, 'INR', ${NOW}, '2026-10-12', 'pending', 'Pending Mart', 'pending mart', 'upi', '627951725405', NULL, NULL, NULL, 'sms', NULL, 'ref:627951725405', ${NOW}, ${NOW}),
      (6, 1, 1, 'debit', 777, 'INR', ${NOW}, '2026-10-13', 'ignored', 'Ignored Shop', 'ignored shop', 'upi', '627951725406', NULL, NULL, NULL, 'sms', NULL, 'ref:627951725406', ${NOW}, ${NOW}),
      (7, 1, 4, 'debit', 50000, 'INR', ${NOW}, '2026-10-14', 'confirmed', 'Self', 'self', 'upi', '627951725407', NULL, NULL, NULL, 'sms', NULL, 'ref:627951725407', ${NOW}, ${NOW}),
      (8, 1, 4, 'credit', 1000, 'INR', ${NOW}, '2026-10-14', 'confirmed', 'Self', 'self', 'upi', '627951725408', NULL, NULL, NULL, 'sms', NULL, 'ref:627951725408', ${NOW}, ${NOW}),
      (9, 1, NULL, 'debit', 250, 'INR', ${NOW}, '2026-10-15', 'confirmed', 'Unknown', 'unknown', 'cash', NULL, NULL, NULL, NULL, 'manual', NULL, NULL, ${NOW}, ${NOW}),
      (10, 1, 1, 'debit', 2000, 'INR', ${NOW}, '2026-09-05', 'confirmed', 'Vikas Munshilal', 'vikas munshilal', 'upi', '627951725409', NULL, NULL, NULL, 'sms', NULL, 'ref:627951725409', ${NOW}, ${NOW});
  `);
  return db;
}

const OCT_FROM = '2026-10-01';
const OCT_TO = '2026-11-01';

describe('reports: totals', () => {
  test('excludes pending, ignored and neutral; includes uncategorized', () => {
    const db = seed();
    const t = getTotals(db, OCT_FROM, OCT_TO);
    expect(t.incomeMinor).toBe(250000);
    // 3000 + 500 + 1200 + 250 (uncategorized manual)
    expect(t.expenseMinor).toBe(4950);
    expect(t.txnCount).toBe(5);
  });
});

describe('reports: breakdown', () => {
  test('debit breakdown ordered desc, uncategorized grouped', () => {
    const db = seed();
    const rows = getCategoryBreakdown(db, 'debit', OCT_FROM, OCT_TO);
    expect(rows.map((r) => [r.name, r.totalMinor, r.txnCount])).toEqual([
      ['Food & Dining', 3500, 2],
      ['Transport & Fuel', 1200, 1],
      ['Uncategorized', 250, 1],
    ]);
  });

  test('credit breakdown', () => {
    const db = seed();
    const rows = getCategoryBreakdown(db, 'credit', OCT_FROM, OCT_TO);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Salary',
      totalMinor: 250000,
      txnCount: 1,
    });
  });
});

describe('reports: series + zero-fill', () => {
  test('daily series zero-fills missing days', () => {
    const db = seed();
    const filled = zeroFillDaily(
      getDailySeries(db, '2026-10-06', '2026-10-09'),
      '2026-10-06',
      '2026-10-09',
    );
    expect(filled.map((b) => b.bucket)).toEqual([
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
    ]);
    expect(filled[0]).toMatchObject({ incomeMinor: 0, expenseMinor: 3500 });
    expect(filled[1]).toMatchObject({ incomeMinor: 0, expenseMinor: 0 });
  });

  test('weekly series uses Monday buckets', () => {
    const db = seed();
    const filled = zeroFillWeekly(
      getWeeklySeries(db, OCT_FROM, OCT_TO),
      OCT_FROM,
      OCT_TO,
    );
    expect(filled.map((b) => b.bucket)).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
    const week = filled.find((b) => b.bucket === '2026-10-05');
    expect(week).toMatchObject({ incomeMinor: 250000, expenseMinor: 4700 });
    // Week of 10-12 holds only pending/ignored/neutral + uncategorized 10-15
    const week2 = filled.find((b) => b.bucket === '2026-10-12');
    expect(week2).toMatchObject({ incomeMinor: 0, expenseMinor: 250 });
  });

  test('monthly series uses YYYY-MM buckets', () => {
    const db = seed();
    const filled = zeroFillMonthly(
      getMonthlySeries(db, '2026-09-01', '2026-11-01'),
      '2026-09-01',
      '2026-11-01',
    );
    expect(filled.map((b) => b.bucket)).toEqual(['2026-09', '2026-10']);
    expect(filled[0]).toMatchObject({ incomeMinor: 0, expenseMinor: 2000 });
    expect(filled[1]).toMatchObject({
      incomeMinor: 250000,
      expenseMinor: 4950,
    });
  });

  test('zero-fill helpers return empty for empty ranges', () => {
    expect(zeroFillDaily([], '2026-10-01', '2026-10-01')).toEqual([]);
    expect(zeroFillWeekly([], '2026-10-05', '2026-10-05')).toEqual([]);
    expect(zeroFillMonthly([], '2026-10', '2026-10')).toEqual([]);
  });
});

describe('reports: top payees + pending', () => {
  test('top payees ordered desc, limit respected', () => {
    const db = seed();
    const top = getTopPayees(db, 'debit', OCT_FROM, OCT_TO);
    expect(top[0]).toMatchObject({
      counterpartyKey: 'vikas munshilal',
      totalMinor: 3500,
      n: 2,
    });
    expect(top.map((t) => t.counterpartyKey)).toEqual(
      expect.arrayContaining(['uber', 'unknown']),
    );
    expect(getTopPayees(db, 'debit', OCT_FROM, OCT_TO, 1)).toHaveLength(1);
  });

  test('pending count', () => {
    const db = seed();
    expect(getPendingCount(db)).toBe(1);
  });
});
