import { useMemo, useState } from 'react';
import { Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { smsMessages } from '@/db/schema';
import { listCategories } from '@/repositories/categories';
import { listTransactions, updateTransaction } from '@/repositories/transactions';
import { upsertMerchantRule } from '@/repositories/rules';
import { normalizeCounterparty } from '@/services/ingest';
import { useAppTheme } from '@/theme/useTheme';
import { CategoryChip } from '@/components/ui/CategoryChip';
import { parseAmountSafe, formatINR } from '@/utils/money';
import { getBridge } from '@/services/bridge';

/**
 * Quick-categorize bottom-sheet — deep-link target for the notification
 * "More…" action (financetracker://review/<hash>). Closes itself after save.
 */
export default function ReviewDetail() {
  const t = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const hash = decodeURIComponent(id ?? '');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState('');

  const found = useMemo(() => {
    try {
      const db = getDb();
      const sms = db.select().from(smsMessages).where(eq(smsMessages.smsHash, hash)).get() ?? null;
      const txns = listTransactions(db, {});
      const txn = txns.find((x) => x.smsMessageId === sms?.id) ?? txns.find((x) => x.dedupeKey === `sms:${hash}`) ?? null;
      return { sms, txn, cats: listCategories(db) };
    } catch {
      return { sms: null, txn: null, cats: [] };
    }
  }, [hash]);

  const txn = found.txn;
  const dir = txn?.direction ?? 'debit';
  const dirCats = found.cats.filter((c) =>
    dir === 'debit' ? c.kind !== 'income' : c.kind !== 'expense',
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const save = (status: 'confirmed' | 'ignored') => {
    if (!txn) {
      setErr('Ledger entry not found for this notification.');
      return;
    }
    try {
      const db = getDb();
      const patch: { status: 'confirmed' | 'ignored'; categoryId: number | null; amountMinor?: number } = {
        status,
        categoryId: status === 'ignored' ? txn.categoryId : (categoryId ?? txn.categoryId),
      };
      if (amount.trim()) {
        const minor = parseAmountSafe(amount);
        if (minor === null || minor <= 0) {
          setErr('Invalid amount.');
          return;
        }
        patch.amountMinor = minor;
      }
      updateTransaction(db, txn.id, patch);
      const key = txn.counterpartyName ?? txn.description;
      if (status === 'confirmed' && patch.categoryId != null && key) {
        try {
          upsertMerchantRule(db, { matchType: 'exact', matchKey: normalizeCounterparty(key), direction: txn.direction, categoryId: patch.categoryId });
        } catch { /* ignore */ }
      }
      void getBridge().then((b) => b?.cancelNotification(hash).catch(() => undefined));
      close();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed.');
    }
  };

  return (
    <ScrollView style={[styles.wrap, { backgroundColor: t.background }]}>
      <Text style={[styles.h, { color: t.text }]}>Categorize</Text>
      {txn ? (
        <Text style={[styles.amt, { color: dir === 'debit' ? t.danger : t.success }]}>
          {dir === 'debit' ? '−' : '+'}₹{formatINR(txn.amountMinor)} · {txn.counterpartyName ?? txn.description ?? ''}
        </Text>
      ) : (
        <Text style={{ color: t.textMuted }}>No pending entry found{found.sms ? ' (SMS known, ledger row missing)' : ''}.</Text>
      )}
      {found.sms ? (
        <Text style={[styles.sms, { color: t.textMuted }]} numberOfLines={3}>{found.sms.body}</Text>
      ) : null}
      <View style={styles.chips}>
        {dirCats.filter((c) => c.isArchived === 0).map((c) => (
          <CategoryChip key={c.id} emoji={c.icon} name={c.name} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
        ))}
      </View>
      <Text style={[styles.lbl, { color: t.text }]}>Edit amount (optional)</Text>
      <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Leave blank to keep" placeholderTextColor={t.textMuted} style={[styles.input, { borderColor: t.border, color: t.text }]} />
      {err ? <Text style={{ color: t.danger }}>{err}</Text> : null}
      <View style={{ height: 12 }} />
      <Button title="Save" onPress={() => save('confirmed')} />
      <View style={{ height: 8 }} />
      <Pressable onPress={() => save('ignored')}>
        <Text style={{ color: t.textMuted, textAlign: 'center' }}>Ignore</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  h: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  amt: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'], marginBottom: 8 },
  sms: { fontSize: 12, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 8 },
  lbl: { fontWeight: '700', marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 4 },
});
