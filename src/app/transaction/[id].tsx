import { useMemo, useState } from 'react';
import { Alert, Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getDb } from '@/db/client';
import { listAccounts } from '@/repositories/accounts';
import { listCategories } from '@/repositories/categories';
import { deleteTransaction, getTransaction, updateTransaction } from '@/repositories/transactions';
import { parseAmountSafe, formatINR } from '@/utils/money';
import { useAppTheme } from '@/theme/useTheme';
import { CategoryChip } from '@/components/ui/CategoryChip';

export default function TransactionDetail() {
  const t = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const txnId = Number(id);
  const [editing, setEditing] = useState(false);

  const data = useMemo(() => {
    try {
      const db = getDb();
      return {
        txn: getTransaction(db, txnId),
        cats: listCategories(db),
        accts: listAccounts(db),
      };
    } catch {
      return { txn: null, cats: [], accts: [] };
    }
  }, [txnId]);

  const txn = data.txn;
  const [amount, setAmount] = useState(txn ? formatINR(txn.amountMinor) : '');
  const [note, setNote] = useState(txn?.note ?? '');
  const [categoryId, setCategoryId] = useState<number | null>(txn?.categoryId ?? null);
  const [err, setErr] = useState('');

  if (!txn) {
    return (
      <View style={[styles.wrap, { backgroundColor: t.background }]}>
        <Text style={{ color: t.text }}>Transaction not found.</Text>
      </View>
    );
  }

  const save = () => {
    const minor = parseAmountSafe(amount);
    if (minor === null || minor <= 0) {
      setErr('Enter a valid amount.');
      return;
    }
    try {
      updateTransaction(getDb(), txn.id, { amountMinor: minor, note: note || null, categoryId });
      setEditing(false);
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed.');
    }
  };

  const remove = () => {
    Alert.alert('Delete?', 'This entry will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try { deleteTransaction(getDb(), txn.id); } catch { /* ignore */ }
          router.back();
        },
      },
    ]);
  };

  const dirCats = data.cats.filter((c) =>
    txn.direction === 'debit' ? c.kind !== 'income' : c.kind !== 'expense',
  );

  return (
    <ScrollView style={[styles.wrap, { backgroundColor: t.background }]}>
      <Text style={[styles.amt, { color: txn.direction === 'debit' ? t.danger : t.success }]}>
        {txn.direction === 'debit' ? '−' : '+'}₹{formatINR(txn.amountMinor)}
      </Text>
      <Text style={{ color: t.textMuted }}>
        {[txn.counterpartyName, txn.localDate, txn.source, txn.status].filter(Boolean).join(' · ')}
      </Text>
      {txn.description ? <Text style={{ color: t.textMuted }}>{txn.description}</Text> : null}
      {txn.reference ? <Text style={{ color: t.textMuted }}>Ref {txn.reference}</Text> : null}

      {!editing ? (
        <>
          <View style={{ height: 16 }} />
          <Button title="Edit" onPress={() => { setAmount(formatINR(txn.amountMinor)); setNote(txn.note ?? ''); setCategoryId(txn.categoryId); setEditing(true); }} />
          <View style={{ height: 8 }} />
          <Button title="Delete" color={t.danger} onPress={remove} />
        </>
      ) : (
        <>
          <Text style={[styles.lbl, { color: t.text }]}>Amount</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={[styles.input, { borderColor: t.border, color: t.text }]} />
          <Text style={[styles.lbl, { color: t.text }]}>Category</Text>
          <View style={styles.chips}>
            {dirCats.filter((c) => c.isArchived === 0).map((c) => (
              <CategoryChip key={c.id} emoji={c.icon} name={c.name} selected={categoryId === c.id} onPress={() => setCategoryId(categoryId === c.id ? null : c.id)} />
            ))}
          </View>
          <Text style={[styles.lbl, { color: t.text }]}>Note</Text>
          <TextInput value={note} onChangeText={setNote} style={[styles.input, { borderColor: t.border, color: t.text }]} />
          {err ? <Text style={{ color: t.danger }}>{err}</Text> : null}
          <View style={{ height: 8 }} />
          <Button title="Save" onPress={save} />
          <View style={{ height: 8 }} />
          <Pressable onPress={() => setEditing(false)}>
            <Text style={{ color: t.primary }}>Cancel</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  amt: { fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] },
  lbl: { fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
