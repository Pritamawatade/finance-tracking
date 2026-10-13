import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '@/db/client';
import { getSetting } from '@/repositories/settings';
import { listCategories } from '@/repositories/categories';
import { listTransactions } from '@/repositories/transactions';
import { useMonthSummary, usePendingCount } from '@/hooks/useReports';
import { getMonthlySeries, zeroFillMonthly } from '@/repositories/reports';
import { addMonths, monthRange } from '@/utils/dates';
import { useUiStore } from '@/store/uiStore';
import { useAppTheme } from '@/theme/useTheme';
import { StatCard } from '@/components/ui/StatCard';
import { Donut } from '@/components/charts/Donut';
import { Bars } from '@/components/charts/Bars';
import { TransactionRow } from '@/components/transaction/TransactionRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { AppButton } from '@/components/ui/AppButton';

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function monthLabel(yyyyMM: string): string {
  const y = Number(yyyyMM.slice(0, 4));
  const m = Number(yyyyMM.slice(5, 7));
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export default function Home() {
  const t = useAppTheme();
  const dbVersion = useUiStore((s) => s.dbVersion);
  const [month, setMonth] = useState(currentMonthKey());
  const [selCat, setSelCat] = useState<number | null>(null);
  const summary = useMonthSummary(month);
  const pending = usePendingCount();

  useEffect(() => {
    try {
      const done = getSetting(getDb(), 'onboarding_done', '0');
      if (done !== '1') router.replace('/onboarding');
    } catch {
      // web: stay
    }
  }, []);

  const { from, to } = monthRange(month);
  const sixFrom = `${addMonths(month, -5)}-01`;
  const bars = useMemo(() => {
    try {
      return zeroFillMonthly(getMonthlySeries(getDb(), sixFrom, to), sixFrom, to);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sixFrom, to, dbVersion]);

  const recent = useMemo(() => {
    try {
      return listTransactions(getDb(), { from, to }).slice(0, 5);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, dbVersion]);

  const catMeta = useMemo(() => {
    try {
      const m = new Map(listCategories(getDb(), true).map((c) => [c.id, c]));
      return m;
    } catch {
      return new Map<number, { icon: string; name: string }>();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbVersion]);

  return (
    <Screen contentStyle={{ backgroundColor: t.background }}>
      <View style={styles.switcher}>
        <Pressable
          onPress={() => setMonth((m) => addMonths(m, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={12}
          style={styles.chevBtn}
        >
          <Ionicons name="chevron-back" size={26} color={t.primary} />
        </Pressable>
        <Text style={[styles.month, { color: t.text }]}>{monthLabel(month)}</Text>
        <Pressable
          onPress={() => setMonth((m) => addMonths(m, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={12}
          style={styles.chevBtn}
        >
          <Ionicons name="chevron-forward" size={26} color={t.primary} />
        </Pressable>
      </View>

      <View style={styles.cards}>
        <StatCard label="Received" minor={summary.incomeMinor} tone="income" />
        <StatCard label="Spent" minor={summary.expenseMinor} tone="expense" />
        <StatCard label="Net" minor={summary.netMinor} />
      </View>

      {pending > 0 && (
        <Link href="/review" asChild>
          <Pressable style={StyleSheet.flatten([styles.banner, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }])}>
            <Text style={styles.bannerText}>Needs review ({pending})</Text>
            <Ionicons name="chevron-forward" size={18} color="#92400E" />
          </Pressable>
        </Link>
      )}

      <Donut rows={summary.breakdown} selectedId={selCat} onSelect={setSelCat} />

      <Text style={[styles.h, { color: t.text }]}>Last 6 months</Text>
      <Bars data={bars} />

      <View style={styles.rowHead}>
        <Text style={[styles.h, { color: t.text }]}>Recent</Text>
        <Link href={{ pathname: '/summary/[month]', params: { month } }} asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open month summary"
            hitSlop={12}
            style={styles.inlineLink}
          >
            <Text style={{ color: t.primary }}>Summary</Text>
            <Ionicons name="chevron-forward" size={16} color={t.primary} />
          </Pressable>
        </Link>
      </View>
      {recent.length === 0 ? (
        <EmptyState title="No transactions" hint="Tap + to add one, or wait for a bank SMS." />
      ) : (
        recent.map((txn) => (
          <TransactionRow
            key={txn.id}
            txn={txn}
            emoji={txn.categoryId != null ? catMeta.get(txn.categoryId)?.icon : undefined}
            categoryName={txn.categoryId != null ? catMeta.get(txn.categoryId)?.name : undefined}
            onPress={() => router.push(`/transaction/${txn.id}`)}
          />
        ))
      )}
      <Link href={{ pathname: '/summary/[month]', params: { month } }} asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open month summary"
          android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
          style={({ pressed }) => [styles.summaryBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Open month summary</Text>
        </Pressable>
      </Link>
      <View style={{ height: 24 }} />
      <AppButton title="Go to Transactions" onPress={() => router.push('/(tabs)/transactions')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginVertical: 8 },
  chevBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  month: { fontSize: 18, fontWeight: '800' },
  cards: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  banner: { borderWidth: 1, borderRadius: 10, padding: 12, marginVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  bannerText: { fontWeight: '700', color: '#92400E' },
  h: { fontSize: 16, fontWeight: '800', marginTop: 12 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inlineLink: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 8 },
  summaryBtn: {
    backgroundColor: '#208AEF',
    borderRadius: 10,
    padding: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
});
