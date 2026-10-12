import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getDb } from '@/db/client';
import {
  getCategoryBreakdown,
  getDailySeries,
  getTopPayees,
  getTotals,
  zeroFillDaily,
} from '@/repositories/reports';
import { addMonths, monthRange } from '@/utils/dates';
import { useUiStore } from '@/store/uiStore';
import { useAppTheme } from '@/theme/useTheme';
import { StatCard } from '@/components/ui/StatCard';
import { Donut } from '@/components/charts/Donut';
import { formatINR } from '@/utils/money';

export default function MonthSummary() {
  const t = useAppTheme();
  const { month } = useLocalSearchParams<{ month: string }>();
  const ym = typeof month === 'string' && /^\d{4}-\d{2}$/.test(month) ? month : '2026-10';
  const dbVersion = useUiStore((s) => s.dbVersion);

  const data = useMemo(() => {
    try {
      const db = getDb();
      const { from, to } = monthRange(ym);
      const totals = getTotals(db, from, to);
      const prev = monthRange(addMonths(ym, -1));
      const prevTotals = getTotals(db, prev.from, prev.to);
      const breakdown = getCategoryBreakdown(db, 'debit', from, to);
      const payees = getTopPayees(db, 'debit', from, to);
      const daily = zeroFillDaily(getDailySeries(db, from, to), from, to);
      return { totals, prevTotals, breakdown, payees, daily };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, dbVersion]);

  if (!data) {
    return (
      <View style={[styles.wrap, { backgroundColor: t.background }]}>
        <Text style={{ color: t.textMuted }}>Loading…</Text>
      </View>
    );
  }

  const net = data.totals.incomeMinor - data.totals.expenseMinor;
  const savingsRate =
    data.totals.incomeMinor > 0 ? Math.round((net / data.totals.incomeMinor) * 100) : 0;
  const days = Math.max(1, data.daily.length);
  const dailyAvg = Math.round(data.totals.expenseMinor / days);
  const biggest = data.daily.reduce((m, d) => Math.max(m, d.expenseMinor), 0);
  const delta = data.totals.expenseMinor - data.prevTotals.expenseMinor;

  return (
    <ScrollView style={[styles.wrap, { backgroundColor: t.background }]}>
      <Text style={[styles.title, { color: t.text }]}>{ym} summary</Text>
      <View style={styles.cards}>
        <StatCard label="Received" minor={data.totals.incomeMinor} tone="income" />
        <StatCard label="Spent" minor={data.totals.expenseMinor} tone="expense" />
        <StatCard label="Net" minor={net} />
      </View>
      <Text style={[styles.line, { color: t.text }]}>
        Savings rate {savingsRate}% · Daily avg ₹{formatINR(dailyAvg)} · Biggest day ₹{formatINR(biggest)}
      </Text>
      <Text style={[styles.line, { color: t.textMuted }]}>
        vs prev month: {delta >= 0 ? '+' : '−'}₹{formatINR(Math.abs(delta))} spent
      </Text>
      <Donut rows={data.breakdown} />
      <Text style={[styles.h, { color: t.text }]}>Top payees</Text>
      {data.payees.length === 0 ? (
        <Text style={{ color: t.textMuted }}>None.</Text>
      ) : (
        data.payees.map((p) => (
          <View key={p.counterpartyKey} style={styles.row}>
            <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
              {p.counterpartyName ?? p.counterpartyKey}
            </Text>
            <Text style={[styles.amt, { color: t.text }]}>₹{formatINR(p.totalMinor)}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 12 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  cards: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  line: { fontSize: 13, marginTop: 4, fontVariant: ['tabular-nums'] },
  h: { fontSize: 16, fontWeight: '800', marginTop: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  name: { flex: 1, fontWeight: '600' },
  amt: { fontWeight: '700', fontVariant: ['tabular-nums'] },
});
