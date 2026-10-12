import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getDb } from '@/db/client';
import { listCategories } from '@/repositories/categories';
import {
  getCategoryBreakdown,
  getDailySeries,
  getMonthlySeries,
  getTopPayees,
  getTotals,
  getWeeklySeries,
  zeroFillDaily,
  zeroFillMonthly,
  zeroFillWeekly,
} from '@/repositories/reports';
import { useUiStore } from '@/store/uiStore';
import { useAppTheme } from '@/theme/useTheme';
import { Donut } from '@/components/charts/Donut';
import { Bars } from '@/components/charts/Bars';
import { Trend } from '@/components/charts/Trend';
import { TransactionRow } from '@/components/transaction/TransactionRow';
import { listTransactions } from '@/repositories/transactions';
import { formatINR } from '@/utils/money';

function pad(n: number): string {
  return `${n}`.padStart(2, '0');
}

function rangeFor(mode: 'week' | 'month' | 'year', anchor: string): { from: string; to: string; label: string } {
  if (mode === 'month') {
    const ym = anchor.slice(0, 7);
    const y = Number(ym.slice(0, 4));
    const m = Number(ym.slice(5, 7));
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    return { from: `${ym}-01`, to: `${ny}-${pad(nm)}-01`, label: ym };
  }
  if (mode === 'year') {
    const y = anchor.slice(0, 4);
    return { from: `${y}-01-01`, to: `${Number(y) + 1}-01-01`, label: y };
  }
  // week: Monday..Sunday containing anchor
  const [Y, M, D] = anchor.split('-').map(Number);
  const dt = new Date(Y as number, (M as number) - 1, D as number);
  const diff = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - diff);
  const from = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const end = new Date(dt);
  end.setDate(end.getDate() + 7);
  const to = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  return { from, to, label: from };
}

function shiftAnchor(mode: 'week' | 'month' | 'year', anchor: string, delta: number): string {
  const [Y, M, D] = anchor.split('-').map(Number);
  const dt = new Date(Y as number, (M as number) - 1, D as number);
  if (mode === 'week') dt.setDate(dt.getDate() + delta * 7);
  else if (mode === 'month') dt.setMonth(dt.getMonth() + delta);
  else dt.setFullYear(dt.getFullYear() + delta);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function todayAnchor(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function Insights() {
  const t = useAppTheme();
  const dbVersion = useUiStore((s) => s.dbVersion);
  const [mode, setMode] = useState<'week' | 'month' | 'year'>('month');
  const [anchor, setAnchor] = useState(todayAnchor());
  const [dir, setDir] = useState<'debit' | 'credit'>('debit');
  const [selCat, setSelCat] = useState<number | null>(null);

  const { from, to, label } = rangeFor(mode, anchor);

  const data = useMemo(() => {
    try {
      const db = getDb();
      const totals = getTotals(db, from, to);
      const breakdown = getCategoryBreakdown(db, dir, from, to);
      const granularity = mode === 'year' ? 'monthly' : 'daily';
      const series =
        granularity === 'monthly'
          ? zeroFillMonthly(getMonthlySeries(db, from, to), from, to)
          : mode === 'week'
            ? zeroFillDaily(getDailySeries(db, from, to), from, to)
            : zeroFillDaily(getDailySeries(db, from, to), from, to);
      void getWeeklySeries;
      void zeroFillWeekly;
      const prev = shiftAnchor(mode, anchor, -1);
      const pr = rangeFor(mode, prev);
      const prevSeries =
        granularity === 'monthly'
          ? zeroFillMonthly(getMonthlySeries(db, pr.from, pr.to), pr.from, pr.to)
          : zeroFillDaily(getDailySeries(db, pr.from, pr.to), pr.from, pr.to);
      const prevTotals = getTotals(db, pr.from, pr.to);
      const payees = getTopPayees(db, 'debit', from, to);
      const cats = new Map(listCategories(db, true).map((c) => [c.id, c]));
      const txns = listTransactions(db, {
        from,
        to,
        categoryIds: selCat != null ? [selCat] : undefined,
      }).slice(0, 10);
      return { totals, breakdown, series, prevSeries, prevTotals, payees, cats, txns };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, mode, anchor, dir, selCat, dbVersion]);

  if (!data) {
    return (
      <View style={[styles.wrap, { backgroundColor: t.background }]}>
        <Text style={{ color: t.textMuted }}>Loading…</Text>
      </View>
    );
  }

  const net = data.totals.incomeMinor - data.totals.expenseMinor;
  const days = Math.max(1, data.series.length);
  const avg = Math.round(data.totals.expenseMinor / days);
  const prevNet = data.prevTotals.incomeMinor - data.prevTotals.expenseMinor;
  void prevNet;
  const pctVsPrev =
    data.prevTotals.expenseMinor > 0
      ? Math.round(
          ((data.totals.expenseMinor - data.prevTotals.expenseMinor) /
            data.prevTotals.expenseMinor) *
            100,
        )
      : 0;

  return (
    <ScrollView style={[styles.wrap, { backgroundColor: t.background }]}>
      <View style={styles.seg}>
        {(['week', 'month', 'year'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[styles.segBtn, { backgroundColor: mode === m ? t.primary : t.surfaceMuted }]}
          >
            <Text style={{ color: mode === m ? '#fff' : t.text, fontWeight: '700' }}>
              {m === 'week' ? 'Week' : m === 'month' ? 'Month' : 'Year'}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.nav}>
        <Pressable onPress={() => setAnchor((a) => shiftAnchor(mode, a, -1))}>
          <Text style={[styles.chev, { color: t.primary }]}>‹</Text>
        </Pressable>
        <Text style={[styles.label, { color: t.text }]}>{label}</Text>
        <Pressable onPress={() => setAnchor((a) => shiftAnchor(mode, a, 1))}>
          <Text style={[styles.chev, { color: t.primary }]}>›</Text>
        </Pressable>
        <Pressable onPress={() => setAnchor(todayAnchor())}>
          <Text style={{ color: t.primary }}>Today</Text>
        </Pressable>
      </View>

      <View style={styles.sumRow}>
        <View style={styles.sumCell}>
          <Text style={[styles.sumLbl, { color: t.textMuted }]}>Received</Text>
          <Text style={[styles.sumVal, { color: t.success }]}>₹{formatINR(data.totals.incomeMinor)}</Text>
        </View>
        <View style={styles.sumCell}>
          <Text style={[styles.sumLbl, { color: t.textMuted }]}>Spent</Text>
          <Text style={[styles.sumVal, { color: t.danger }]}>₹{formatINR(data.totals.expenseMinor)}</Text>
        </View>
        <View style={styles.sumCell}>
          <Text style={[styles.sumLbl, { color: t.textMuted }]}>Net</Text>
          <Text style={[styles.sumVal, { color: t.text }]}>₹{formatINR(net)}</Text>
        </View>
        <View style={styles.sumCell}>
          <Text style={[styles.sumLbl, { color: t.textMuted }]}>Avg/day</Text>
          <Text style={[styles.sumVal, { color: t.text }]}>₹{formatINR(avg)}</Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        <Text style={[styles.chip, { color: t.text }]}>
          {pctVsPrev >= 0 ? '↑' : '↓'} {Math.abs(pctVsPrev)}% vs prev {mode}
        </Text>
      </View>

      <Bars data={data.series} />
      <View style={styles.seg}>
        {(['debit', 'credit'] as const).map((d) => (
          <Pressable
            key={d}
            onPress={() => setDir(d)}
            style={[styles.segBtn, { backgroundColor: dir === d ? t.primary : t.surfaceMuted }]}
          >
            <Text style={{ color: dir === d ? '#fff' : t.text, fontWeight: '700' }}>
              {d === 'debit' ? 'Spent' : 'Received'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Donut rows={data.breakdown} selectedId={selCat} onSelect={setSelCat} />
      <Trend current={data.series} previous={data.prevSeries} />

      <Text style={[styles.h, { color: t.text }]}>Top payees</Text>
      {data.payees.length === 0 ? (
        <Text style={{ color: t.textMuted }}>No payees this period.</Text>
      ) : (
        data.payees.map((p) => (
          <View key={p.counterpartyKey} style={[styles.payee, { borderColor: t.border }]}>
            <Text style={[styles.payeeName, { color: t.text }]} numberOfLines={1}>
              {p.counterpartyName ?? p.counterpartyKey} ×{p.n}
            </Text>
            <Text style={[styles.payeeAmt, { color: t.text }]}>₹{formatINR(p.totalMinor)}</Text>
          </View>
        ))
      )}

      <Text style={[styles.h, { color: t.text }]}>Transactions</Text>
      {data.txns.map((txn) => (
        <TransactionRow
          key={txn.id}
          txn={txn}
          emoji={txn.categoryId != null ? data.cats.get(txn.categoryId)?.icon : undefined}
          categoryName={txn.categoryId != null ? data.cats.get(txn.categoryId)?.name : undefined}
          onPress={() => router.push(`/transaction/${txn.id}`)}
        />
      ))}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 12 },
  seg: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  segBtn: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 },
  chev: { fontSize: 28, fontWeight: '700', paddingHorizontal: 8 },
  label: { fontSize: 16, fontWeight: '800', flex: 1 },
  sumRow: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  sumCell: { flex: 1 },
  sumLbl: { fontSize: 11 },
  sumVal: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  chipRow: { marginVertical: 4 },
  chip: { fontSize: 13, fontWeight: '700' },
  h: { fontSize: 16, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  payee: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, paddingVertical: 8 },
  payeeName: { flex: 1, fontSize: 14, fontWeight: '600' },
  payeeAmt: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
