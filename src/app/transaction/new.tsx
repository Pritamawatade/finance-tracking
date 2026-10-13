import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { getDb } from '@/db/client';
import { listAccounts } from '@/repositories/accounts';
import { listCategories } from '@/repositories/categories';
import { createTransaction } from '@/repositories/transactions';
import { getSetting, setSetting } from '@/repositories/settings';
import { parseAmountSafe } from '@/utils/money';
import { useAppTheme } from '@/theme/useTheme';
import { CategoryChip } from '@/components/ui/CategoryChip';
import { Screen } from '@/components/ui/Screen';
import { AppButton } from '@/components/ui/AppButton';

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

export default function NewTransaction() {
  const t = useAppTheme();
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'debit' | 'credit'>('debit');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(todayLocal());
  const [accountId, setAccountId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  const cats = useMemo(() => {
    try {
      return listCategories(getDb()).filter((c) =>
        direction === 'debit' ? c.kind === 'expense' || c.kind === 'neutral' : c.kind === 'income' || c.kind === 'neutral',
      );
    } catch {
      return [];
    }
  }, [direction]);

  const accounts = useMemo(() => {
    try {
      return listAccounts(getDb());
    } catch {
      return [];
    }
  }, []);

  const acct = accountId ?? accounts[0]?.id ?? null;

  const save = (andAnother: boolean) => {
    const minor = parseAmountSafe(amount);
    if (minor === null || minor <= 0) {
      setErr('Enter a valid amount.');
      return;
    }
    if (acct == null) {
      setErr('No account available.');
      return;
    }
    try {
      const db = getDb();
      createTransaction(db, {
        accountId: acct,
        categoryId,
        direction,
        amountMinor: minor,
        occurredAt: Date.now(),
        localDate: date,
        status: 'confirmed',
        note: note || undefined,
        source: 'manual',
      });
      try {
        setSetting(db, 'last_used_account', String(acct));
        void getSetting;
      } catch { /* ignore */ }
      if (Platform.OS !== 'web') {
        import('expo-haptics').then((H) => H.notificationAsync(H.NotificationFeedbackType.Success).catch(() => undefined)).catch(() => undefined);
      }
      if (andAnother) {
        setAmount('');
        setNote('');
        setCategoryId(null);
      } else {
        router.back();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed.');
    }
  };

  return (
    <Screen contentStyle={{ backgroundColor: t.background }}>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        keyboardType="decimal-pad"
        autoFocus
        style={[styles.amount, { color: t.text, borderColor: t.border }]}
      />
      <View style={styles.toggleRow}>
        {(['debit', 'credit'] as const).map((d) => (
          <Pressable
            key={d}
            onPress={() => { setDirection(d); setCategoryId(null); }}
            accessibilityRole="button"
            accessibilityLabel={d === 'debit' ? 'Spent' : 'Received'}
            style={[styles.toggle, { backgroundColor: direction === d ? t.primary : t.surfaceMuted }]}
          >
            <Text style={{ color: direction === d ? '#fff' : t.text, fontWeight: '700' }}>
              {d === 'debit' ? 'Spent' : 'Received'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.lbl, { color: t.text }]}>Category</Text>
      <View style={styles.chips}>
        {cats.map((c) => (
          <CategoryChip
            key={c.id}
            emoji={c.icon}
            name={c.name}
            selected={categoryId === c.id}
            onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
          />
        ))}
      </View>
      <Text style={[styles.lbl, { color: t.text }]}>Date (YYYY-MM-DD)</Text>
      <TextInput value={date} onChangeText={setDate} style={[styles.input, { borderColor: t.border, color: t.text }]} />
      <Text style={[styles.lbl, { color: t.text }]}>Account</Text>
      <View style={styles.chips}>
        {accounts.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => setAccountId(a.id)}
            accessibilityRole="button"
            accessibilityLabel={`Account ${a.name}`}
            style={[styles.acct, { backgroundColor: acct === a.id ? t.primary : t.surfaceMuted }]}
          >
            <Text style={{ color: acct === a.id ? '#fff' : t.text }}>{a.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.lbl, { color: t.text }]}>Note</Text>
      <TextInput value={note} onChangeText={setNote} style={[styles.input, { borderColor: t.border, color: t.text }]} />
      {err ? <Text style={{ color: t.danger }}>{err}</Text> : null}
      <View style={{ height: 8 }} />
      <AppButton title="Save" onPress={() => save(false)} />
      <View style={{ height: 8 }} />
      <AppButton title="Save & add another" onPress={() => save(true)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  amount: { fontSize: 40, fontWeight: '800', borderBottomWidth: 1, marginBottom: 12, fontVariant: ['tabular-nums'] },
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  toggle: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  lbl: { fontWeight: '700', marginTop: 12, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 44 },
  acct: { borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, marginBottom: 8, minHeight: 44, justifyContent: 'center' },
});
