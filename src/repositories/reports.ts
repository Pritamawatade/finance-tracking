import { sql } from 'drizzle-orm';
import type { AppDb } from '../db/types';
import { UNCATEGORIZED_COLOR } from '../theme/tokens';
import { countPending as countPendingTxns } from './transactions';

export interface Totals {
  incomeMinor: number;
  expenseMinor: number;
  txnCount: number;
}

export interface BreakdownRow {
  categoryId: number | null;
  name: string;
  icon: string;
  color: string;
  totalMinor: number;
  txnCount: number;
}

export interface SeriesBucket {
  bucket: string;
  incomeMinor: number;
  expenseMinor: number;
}

export interface TopPayee {
  counterpartyName: string | null;
  counterpartyKey: string;
  totalMinor: number;
  n: number;
}

/** Spec §10 — totals (income / expense / net inputs). */
export function getTotals(db: AppDb, from: string, to: string): Totals {
  const row = db
    .all<{
      income_minor: number;
      expense_minor: number;
      txn_count: number;
    }>(sql`
      SELECT
        COALESCE(SUM(CASE WHEN t.direction='credit' THEN t.amount_minor END),0) AS income_minor,
        COALESCE(SUM(CASE WHEN t.direction='debit'  THEN t.amount_minor END),0) AS expense_minor,
        COUNT(*) AS txn_count
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.status='confirmed'
        AND t.local_date >= ${from} AND t.local_date < ${to}
        AND COALESCE(c.kind,'') <> 'neutral'
    `)[0];
  return {
    incomeMinor: row?.income_minor ?? 0,
    expenseMinor: row?.expense_minor ?? 0,
    txnCount: row?.txn_count ?? 0,
  };
}

/** Spec §10 — category breakdown for one direction. */
export function getCategoryBreakdown(
  db: AppDb,
  dir: 'debit' | 'credit',
  from: string,
  to: string,
): BreakdownRow[] {
  return db
    .all<{
      category_id: number | null;
      name: string;
      icon: string;
      color: string;
      total_minor: number;
      txn_count: number;
    }>(sql`
      SELECT c.id AS category_id,
             COALESCE(c.name,'Uncategorized') AS name,
             COALESCE(c.icon,'❔') AS icon,
             COALESCE(c.color,${UNCATEGORIZED_COLOR}) AS color,
             SUM(t.amount_minor) AS total_minor,
             COUNT(*) AS txn_count
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.status='confirmed' AND t.direction=${dir}
        AND t.local_date >= ${from} AND t.local_date < ${to}
        AND COALESCE(c.kind,'') <> 'neutral'
      GROUP BY c.id
      ORDER BY total_minor DESC
    `)
    .map((r) => ({
      categoryId: r.category_id,
      name: r.name,
      icon: r.icon,
      color: r.color,
      totalMinor: r.total_minor,
      txnCount: r.txn_count,
    }));
}

function seriesSelect(bucketExpr: ReturnType<typeof sql>) {
  return sql`
    SELECT ${bucketExpr} AS bucket,
           SUM(CASE WHEN t.direction='credit' THEN t.amount_minor ELSE 0 END) AS income_minor,
           SUM(CASE WHEN t.direction='debit'  THEN t.amount_minor ELSE 0 END) AS expense_minor
    FROM transactions t LEFT JOIN categories c ON c.id=t.category_id
  `;
}

/** Spec §10 — daily series (week / month views). */
export function getDailySeries(
  db: AppDb,
  from: string,
  to: string,
): SeriesBucket[] {
  return db
    .all<{ bucket: string; income_minor: number; expense_minor: number }>(sql`
      ${seriesSelect(sql`t.local_date`)}
      WHERE t.status='confirmed' AND t.local_date >= ${from} AND t.local_date < ${to}
        AND COALESCE(c.kind,'') <> 'neutral'
      GROUP BY t.local_date ORDER BY t.local_date
    `)
    .map(toBucket);
}

/** Spec §10 — weekly series, bucket = Monday of that week. */
export function getWeeklySeries(
  db: AppDb,
  from: string,
  to: string,
): SeriesBucket[] {
  return db
    .all<{ bucket: string; income_minor: number; expense_minor: number }>(sql`
      ${seriesSelect(sql`date(t.local_date, 'weekday 0', '-6 days')`)}
      WHERE t.status='confirmed' AND t.local_date >= ${from} AND t.local_date < ${to}
        AND COALESCE(c.kind,'') <> 'neutral'
      GROUP BY bucket ORDER BY bucket
    `)
    .map(toBucket);
}

/** Spec §10 — monthly series (year view), bucket = 'YYYY-MM'. */
export function getMonthlySeries(
  db: AppDb,
  from: string,
  to: string,
): SeriesBucket[] {
  return db
    .all<{ bucket: string; income_minor: number; expense_minor: number }>(sql`
      ${seriesSelect(sql`substr(t.local_date,1,7)`)}
      WHERE t.status='confirmed' AND t.local_date >= ${from} AND t.local_date < ${to}
        AND COALESCE(c.kind,'') <> 'neutral'
      GROUP BY bucket ORDER BY bucket
    `)
    .map(toBucket);
}

function toBucket(r: {
  bucket: string;
  income_minor: number;
  expense_minor: number;
}): SeriesBucket {
  return {
    bucket: r.bucket,
    incomeMinor: r.income_minor,
    expenseMinor: r.expense_minor,
  };
}

/** Spec §10 — top payees for one direction (limit 5). */
export function getTopPayees(
  db: AppDb,
  dir: 'debit' | 'credit',
  from: string,
  to: string,
  limit = 5,
): TopPayee[] {
  return db
    .all<{
      counterparty_name: string | null;
      counterparty_key: string;
      total_minor: number;
      n: number;
    }>(sql`
      SELECT t.counterparty_name, t.counterparty_key,
             SUM(t.amount_minor) AS total_minor, COUNT(*) AS n
      FROM transactions t LEFT JOIN categories c ON c.id=t.category_id
      WHERE t.status='confirmed' AND t.direction=${dir} AND t.counterparty_key IS NOT NULL
        AND t.local_date >= ${from} AND t.local_date < ${to}
        AND COALESCE(c.kind,'')<>'neutral'
      GROUP BY t.counterparty_key ORDER BY total_minor DESC LIMIT ${limit}
    `)
    .map((r) => ({
      counterpartyName: r.counterparty_name,
      counterpartyKey: r.counterparty_key,
      totalMinor: r.total_minor,
      n: r.n,
    }));
}

/** Spec §10 — pending badge count. */
export function getPendingCount(db: AppDb): number {
  return countPendingTxns(db);
}

// --- Zero-fill helpers (charts must show empty buckets) ---

function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Fill every day in [from, to) with zero buckets where SQL returned none. */
export function zeroFillDaily(
  rows: SeriesBucket[],
  from: string,
  to: string,
): SeriesBucket[] {
  const byBucket = new Map(rows.map((r) => [r.bucket, r]));
  const out: SeriesBucket[] = [];
  for (
    let d = parseDay(from).getTime();
    d < parseDay(to).getTime();
    d += 86_400_000
  ) {
    const bucket = fmtDay(new Date(d));
    out.push(
      byBucket.get(bucket) ?? { bucket, incomeMinor: 0, expenseMinor: 0 },
    );
  }
  return out;
}

function mondayOf(dayStr: string): string {
  const d = parseDay(dayStr);
  // getUTCDay: 0=Sun..6=Sat → days since Monday
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return fmtDay(new Date(d.getTime() - sinceMonday * 86_400_000));
}

/** Fill every Monday-bucket covering [from, to). */
export function zeroFillWeekly(
  rows: SeriesBucket[],
  from: string,
  to: string,
): SeriesBucket[] {
  const byBucket = new Map(rows.map((r) => [r.bucket, r]));
  const out: SeriesBucket[] = [];
  let cur = parseDay(mondayOf(from)).getTime();
  const end = parseDay(to).getTime();
  while (cur < end) {
    const bucket = fmtDay(new Date(cur));
    out.push(
      byBucket.get(bucket) ?? { bucket, incomeMinor: 0, expenseMinor: 0 },
    );
    cur += 7 * 86_400_000;
  }
  return out;
}

/** Fill every 'YYYY-MM' bucket covering [from, to). */
export function zeroFillMonthly(
  rows: SeriesBucket[],
  from: string,
  to: string,
): SeriesBucket[] {
  const byBucket = new Map(rows.map((r) => [r.bucket, r]));
  const out: SeriesBucket[] = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const endKey = to.slice(0, 7);
  for (;;) {
    const bucket = `${y}-${`${m}`.padStart(2, '0')}`;
    if (bucket >= endKey) break;
    out.push(
      byBucket.get(bucket) ?? { bucket, incomeMinor: 0, expenseMinor: 0 },
    );
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
