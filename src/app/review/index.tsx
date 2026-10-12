import { useMemo, useState } from 'react';
import { Button, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { smsMessages } from '@/db/schema';
import { listCategories } from '@/repositories/categories';
import { listTransactions, updateTransaction } from '@/repositories/transactions';
import { upsertMerchantRule } from '@/repositories/rules';
import { normalizeCounterparty } from '@/services/ingest';
import { useUiStore } from '@/store/uiStore';
import { useAppTheme } from '@/theme/useTheme';
import { CategoryChip } from '@/components/ui/CategoryChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatINR } from '@/utils/money';
import { getBridge } from '@/services/bridge';

export default function ReviewIndex() {
  const t = useAppTheme();
  const dbVersion = useUiStore((s) => s.dbVersion);
  const [multi, setMulti] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [bulkCat, setBulkCat] = useState<number | null>(null);

  const data = useMemo(() => {
    try {
      const db = getDb();
      return {
        pending: listTransactions(db, { status: 'pending' }),
        cats: listCategories(db),
      };
    } catch {
      return { pending: [], cats: [] };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbVersion]);

  const ignore = (id: number, smsId: number | null, hash: string | null) => {
    try {
      updateTransaction(getDb(), id, { status: 'ignored' });
      if (hash) void getBridge().then((b) => b?.cancelNotification(hash).catch(() => undefined));
      void smsId;
    } catch { /* ignore */ }
  };

  const confirmOne = (id: number, categoryId: number | null, key: string | null, direction: 'debit' | 'credit') => {
    try {
      const db = getDb();
      updateTransaction(db, id, { status: 'confirmed', categoryId });
      if (categoryId != null && key) {
        upsertMerchantRule(db, { matchType: 'exact', matchKey: normalizeCounterparty(key), direction, categoryId });
      }
    } catch { /* ignore */ }
  };

  const confirmBulk = () => {
    if (bulkCat == null) return;
    try {
      const db = getDb();
      for (const id of picked) {
        const row = data.pending.find((p) => p.id === id);
        if (!row) continue;
        updateTransaction(db, id, { status: 'confirmed', categoryId: bulkCat });
        const key = row.counterpartyName ?? row.description;
        if (key) {
          try {
            upsertMerchantRule(db, { matchType: 'exact', matchKey: normalizeCounterparty(key), direction: row.direction, categoryId: bulkCat });
          } catch { /* ignore */ }
        }
      }
      setPicked([]);
      setBulkCat(null);
      setMulti(false);
    } catch { /* ignore */ }
  };

  const expenseCats = data.cats.filter((c) => c.kind === 'expense' && c.isArchived === 0);

  return (
    <ScrollView style={[styles.wrap, { backgroundColor: t.background }]}>
      <View style={styles.head}>
        <Text style={[styles.h, { color: t.text }]}>Pending ({data.pending.length})</Text>
        <Pressable onPress={() => { setMulti((m) => !m); setPicked([]); }}>
          <Text style={{ color: t.primary }}>{multi ? 'Done' : 'Select'}</Text>
        </Pressable>
      </View>
      {multi && (
        <View style={[styles.bulk, { borderColor: t.border }]}>
          <Text style={{ color: t.text }}>Bulk category → confirm {picked.length} items</Text>
          <View style={styles.chips}>
            {expenseCats.slice(0, 8).map((c) => (
              <CategoryChip key={c.id} emoji={c.icon} name={c.name} selected={bulkCat === c.id} onPress={() => setBulkCat(c.id)} />
            ))}
          </View>
          <Button title="Confirm selected" disabled={picked.length === 0 || bulkCat == null} onPress={confirmBulk} />
        </View>
      )}
      {data.pending.length === 0 ? (
        <EmptyState title="All caught up" hint="New bank SMS will appear here for review." />
      ) : (
        data.pending.map((p) => {
          const checked = picked.includes(p.id);
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                if (multi) {
                  setPicked((s) => (checked ? s.filter((i) => i !== p.id) : [...s, p.id]));
                } else {
                  void navigateToQuick(p.smsMessageId);
                }
              }}
              style={[styles.card, { backgroundColor: t.card, borderColor: checked ? t.primary : t.border }]}
            >
              <View style={styles.row}>
                {multi ? <Text>{checked ? '☑' : '☐'} </Text> : null}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.amt, { color: p.direction === 'debit' ? t.danger : t.success }]}>
                    {p.direction === 'debit' ? '−' : '+'}₹{formatINR(p.amountMinor)}
                  </Text>
                  <Text style={{ color: t.text }}>{p.counterpartyName ?? p.description ?? 'Unknown'}</Text>
                  <Text style={{ color: t.textMuted, fontSize: 12 }}>{p.localDate} · {p.source}</Text>
                </View>
                <Pressable onPress={() => ignore(p.id, p.smsMessageId, smsHashFor(p.smsMessageId))}>
                  <Text style={{ color: t.textMuted }}>Ignore</Text>
                </Pressable>
              </View>
              {!multi && (
                <View style={styles.chips}>
                  {data.cats
                    .filter((c) => (p.direction === 'debit' ? c.kind !== 'income' : c.kind !== 'expense') && c.isArchived === 0)
                    .slice(0, 6)
                    .map((c) => (
                      <CategoryChip
                        key={c.id}
                        emoji={c.icon}
                        name={c.name}
                        onPress={() => confirmOne(p.id, c.id, p.counterpartyName ?? p.description, p.direction)}
                      />
                    ))}
                </View>
              )}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

function smsHashFor(smsMessageId: number | null): string | null {
  if (smsMessageId == null) return null;
  try {
    const row = getDb().select().from(smsMessages).where(eq(smsMessages.id, smsMessageId)).get();
    return row?.smsHash ?? null;
  } catch {
    return null;
  }
}

async function navigateToQuick(smsMessageId: number | null): Promise<void> {
  const hash = smsHashFor(smsMessageId);
  if (hash) router.push(`/review/${encodeURIComponent(hash)}`);
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  h: { fontSize: 18, fontWeight: '800' },
  bulk: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 10 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amt: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
});
