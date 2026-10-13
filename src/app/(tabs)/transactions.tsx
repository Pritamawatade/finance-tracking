import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getDb } from '@/db/client';
import { listCategories } from '@/repositories/categories';
import {
  deleteTransaction,
  createTransaction,
  listTransactions,
} from '@/repositories/transactions';
import type { Transaction } from '@/db/schema';
import { useUiStore } from '@/store/uiStore';
import { useAppTheme } from '@/theme/useTheme';
import { TransactionRow } from '@/components/transaction/TransactionRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenView } from '@/components/ui/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { formatINR } from '@/utils/money';

type DayGroup = { key: string; title: string; net: number; items: Transaction[] };

function toLocalToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

function dayTitle(localDate: string): string {
  const today = toLocalToday();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yest = `${y.getFullYear()}-${`${y.getMonth() + 1}`.padStart(2, '0')}-${`${y.getDate()}`.padStart(2, '0')}`;
  if (localDate === today) return 'Today';
  if (localDate === yest) return 'Yesterday';
  const [Y, M, D] = localDate.split('-').map(Number);
  const dt = new Date(Y as number, (M as number) - 1, D as number);
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

type FlatRow =
  | { kind: 'header'; key: string; title: string; net: number }
  | { kind: 'txn'; key: string; txn: Transaction };

export default function Transactions() {
  const t = useAppTheme();
  const dbVersion = useUiStore((s) => s.dbVersion);
  const filters = useUiStore((s) => s.filters);
  const setFilters = useUiStore((s) => s.setFilters);
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [undo, setUndo] = useState<Transaction | null>(null);

  const cats = useMemo(() => {
    try {
      return listCategories(getDb(), true);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbVersion]);
  const catMeta = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);

  const txns = useMemo(() => {
    try {
      return listTransactions(getDb(), {
        query: query || filters.query,
        direction: filters.direction === 'all' ? null : filters.direction,
        categoryIds: filters.categoryIds.length > 0 ? filters.categoryIds : undefined,
        accountId: filters.accountId,
        source: filters.source === 'all' ? null : filters.source,
      });
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters, dbVersion]);

  const flat: FlatRow[] = useMemo(() => {
    const groups = new Map<string, DayGroup>();
    for (const txn of txns) {
      let g = groups.get(txn.localDate);
      if (!g) {
        g = { key: txn.localDate, title: dayTitle(txn.localDate), net: 0, items: [] };
        groups.set(txn.localDate, g);
      }
      g.items.push(txn);
      g.net += txn.direction === 'credit' ? txn.amountMinor : -txn.amountMinor;
    }
    const out: FlatRow[] = [];
    for (const g of groups.values()) {
      out.push({ kind: 'header', key: `h-${g.key}`, title: g.title, net: g.net });
      for (const item of g.items) out.push({ kind: 'txn', key: `t-${item.id}`, txn: item });
    }
    return out;
  }, [txns]);

  const doDelete = (txn: Transaction) => {
    try {
      deleteTransaction(getDb(), txn.id);
      setUndo(txn);
    } catch {
      // ignore
    }
  };

  const doUndo = () => {
    if (!undo) return;
    try {
      createTransaction(getDb(), {
        accountId: undo.accountId,
        categoryId: undo.categoryId,
        direction: undo.direction,
        amountMinor: undo.amountMinor,
        occurredAt: undo.occurredAt,
        localDate: undo.localDate,
        status: undo.status,
        counterpartyName: undo.counterpartyName,
        counterpartyKey: undo.counterpartyKey,
        channel: undo.channel,
        reference: undo.reference,
        description: undo.description,
        note: undo.note,
        balanceAfterMinor: undo.balanceAfterMinor,
        source: undo.source,
        smsMessageId: undo.smsMessageId,
      });
    } catch {
      // ignore (dedupe conflict etc.)
    }
    setUndo(null);
  };

  return (
    <ScreenView contentStyle={{ backgroundColor: t.background }}>
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search payee, note…"
          placeholderTextColor={t.textMuted}
          style={[styles.search, { borderColor: t.border, color: t.text }]}
        />
        <Pressable
          onPress={() => setShowFilters((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel="Toggle filters"
          hitSlop={12}
          style={styles.filterBtn}
        >
          <Ionicons name="search" size={22} color={t.text} />
        </Pressable>
      </View>

      {showFilters && (
        <View style={[styles.sheet, { borderColor: t.border, backgroundColor: t.card }]}>
          <Text style={[styles.sheetTitle, { color: t.text }]}>Type</Text>
          <View style={styles.chips}>
            {(['all', 'debit', 'credit'] as const).map((d) => (
              <Pressable
                key={d}
                onPress={() => setFilters({ direction: d })}
                accessibilityRole="button"
                accessibilityLabel={`Filter ${d}`}
                style={[
                  styles.chip,
                  { backgroundColor: filters.direction === d ? t.primary : t.surfaceMuted },
                ]}
              >
                <Text style={{ color: filters.direction === d ? '#fff' : t.text }}>
                  {d === 'all' ? 'All' : d === 'debit' ? 'Spent' : 'Received'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.sheetTitle, { color: t.text }]}>Source</Text>
          <View style={styles.chips}>
            {(['all', 'sms', 'manual'] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => setFilters({ source: s })}
                accessibilityRole="button"
                accessibilityLabel={`Source ${s}`}
                style={[
                  styles.chip,
                  { backgroundColor: filters.source === s ? t.primary : t.surfaceMuted },
                ]}
              >
                <Text style={{ color: filters.source === s ? '#fff' : t.text }}>{s}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.sheetTitle, { color: t.text }]}>Categories</Text>
          <View style={styles.chips}>
            {cats
              .filter((c) => c.isArchived === 0 && c.kind !== 'neutral')
              .slice(0, 12)
              .map((c) => {
                const on = filters.categoryIds.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() =>
                      setFilters({
                        categoryIds: on
                          ? filters.categoryIds.filter((i) => i !== c.id)
                          : [...filters.categoryIds, c.id],
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Category ${c.name}`}
                    style={[
                      styles.chip,
                      { backgroundColor: on ? t.primary : t.surfaceMuted },
                    ]}
                  >
                    <Text style={{ color: on ? '#fff' : t.text }}>
                      {c.icon} {c.name}
                    </Text>
                  </Pressable>
                );
              })}
          </View>
          <AppButton
            title="Clear filters"
            onPress={() => {
              setFilters({ direction: 'all', source: 'all', categoryIds: [], accountId: null, query: '' });
              setQuery('');
            }}
          />
        </View>
      )}

      {undo && (
        <View style={styles.snack}>
          <Text style={{ color: '#fff' }}>Deleted</Text>
          <Pressable
            onPress={doUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo delete"
            hitSlop={12}
            style={styles.undoBtn}
          >
            <Text style={{ color: '#FBBF24', fontWeight: '700' }}>Undo</Text>
          </Pressable>
        </View>
      )}

      {flat.length === 0 ? (
        <EmptyState title="Nothing here" hint="Try clearing search or filters." />
      ) : (
        <FlashList
          data={flat}
          keyExtractor={(r) => r.key}
          contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 16 }}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              const pos = item.net >= 0;
              return (
                <View style={styles.dayHead}>
                  <Text style={[styles.dayTitle, { color: t.text }]}>{item.title}</Text>
                  <Text style={{ color: pos ? t.success : t.danger, fontVariant: ['tabular-nums'] }}>
                    {pos ? '+' : '−'}₹{formatINR(Math.abs(item.net))}
                  </Text>
                </View>
              );
            }
            const meta = item.txn.categoryId != null ? catMeta.get(item.txn.categoryId) : undefined;
            return (
              <View style={styles.swipeRow}>
                <View style={{ flex: 1 }}>
                  <TransactionRow
                    txn={item.txn}
                    emoji={meta?.icon}
                    categoryName={meta?.name}
                    onPress={() => router.push(`/transaction/${item.txn.id}`)}
                  />
                </View>
                <Pressable
                  onPress={() => doDelete(item.txn)}
                  accessibilityRole="button"
                  accessibilityLabel="Delete transaction"
                  hitSlop={12}
                  style={styles.del}
                >
                  <Text style={{ color: '#fff' }}>Del</Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </ScreenView>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  search: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10, minHeight: 44 },
  filterBtn: { padding: 10, borderRadius: 10, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sheet: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  sheetTitle: { fontWeight: '700', marginTop: 8, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 7, minHeight: 44, justifyContent: 'center' },
  snack: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  undoBtn: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, marginBottom: 4 },
  dayTitle: { fontWeight: '800' },
  swipeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  del: { backgroundColor: '#DC2626', borderRadius: 10, padding: 12, minHeight: 44, justifyContent: 'center' },
});
