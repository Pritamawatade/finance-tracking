import { useMemo } from 'react';
import { getDb } from '../db/client';
import type { Transaction } from '../db/schema';
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
  type BreakdownRow,
  type SeriesBucket,
  type TopPayee,
  type Totals,
} from '../repositories/reports';
import { listTransactions, type TransactionFilters } from '../repositories/transactions';
import { useUiStore } from '../store/uiStore';

function monthRange(yyyyMM: string): { from: string; to: string } {
  const [y, m] = yyyyMM.split('-').map(Number);
  const from = `${y}-${`${m}`.padStart(2, '0')}-01`;
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  const to = `${ny}-${`${nm}`.padStart(2, '0')}-01`;
  return { from, to };
}

export interface MonthSummary extends Totals {
  netMinor: number;
  topPayees: TopPayee[];
  breakdown: BreakdownRow[];
}

/** Home / month-end summary data for a 'YYYY-MM' month. */
export function useMonthSummary(yyyyMM: string): MonthSummary {
  const dbVersion = useUiStore((s) => s.dbVersion);
  return useMemo(() => {
    const db = getDb();
    const { from, to } = monthRange(yyyyMM);
    const totals = getTotals(db, from, to);
    return {
      ...totals,
      netMinor: totals.incomeMinor - totals.expenseMinor,
      topPayees: getTopPayees(db, 'debit', from, to),
      breakdown: getCategoryBreakdown(db, 'debit', from, to),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yyyyMM, dbVersion]);
}

export function useCategoryBreakdown(
  dir: 'debit' | 'credit',
  from: string,
  to: string,
): BreakdownRow[] {
  const dbVersion = useUiStore((s) => s.dbVersion);
  return useMemo(() => {
    const db = getDb();
    return getCategoryBreakdown(db, dir, from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir, from, to, dbVersion]);
}

export function useSeries(
  granularity: 'daily' | 'weekly' | 'monthly',
  from: string,
  to: string,
): SeriesBucket[] {
  const dbVersion = useUiStore((s) => s.dbVersion);
  return useMemo(() => {
    const db = getDb();
    if (granularity === 'weekly') {
      return zeroFillWeekly(getWeeklySeries(db, from, to), from, to);
    }
    if (granularity === 'monthly') {
      return zeroFillMonthly(getMonthlySeries(db, from, to), from, to);
    }
    return zeroFillDaily(getDailySeries(db, from, to), from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granularity, from, to, dbVersion]);
}

export function useTransactions(filters: TransactionFilters): Transaction[] {
  const dbVersion = useUiStore((s) => s.dbVersion);
  const filtersKey = JSON.stringify(filters);
  return useMemo(() => {
    const db = getDb();
    return listTransactions(db, JSON.parse(filtersKey) as TransactionFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, dbVersion]);
}

/** Badge count for the "Needs review" entry point. */
export function usePendingCount(): number {
  const dbVersion = useUiStore((s) => s.dbVersion);
  return useMemo(() => {
    try {
      return getPendingCount(getDb());
    } catch {
      return 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbVersion]);
}
