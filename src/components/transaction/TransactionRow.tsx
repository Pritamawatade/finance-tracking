import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Transaction } from '@/db/schema';
import { useAppTheme } from '@/theme/useTheme';
import { formatINR } from '@/utils/money';

export function TransactionRow({
  txn,
  emoji,
  categoryName,
  onPress,
}: {
  txn: Transaction;
  emoji?: string;
  categoryName?: string;
  onPress?: () => void;
}) {
  const t = useAppTheme();
  const isDebit = txn.direction === 'debit';
  const amtColor = isDebit ? t.danger : t.success;
  const sign = isDebit ? '−' : '+';
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, { backgroundColor: t.card, borderColor: t.border }]}
    >
      <Text style={styles.icon}>{emoji ?? '❔'}</Text>
      <View style={styles.mid}>
        <Text style={[styles.cp, { color: t.text }]} numberOfLines={1}>
          {txn.counterpartyName ?? txn.description ?? categoryName ?? 'Uncategorized'}
        </Text>
        <Text style={[styles.sub, { color: t.textMuted }]} numberOfLines={1}>
          {[categoryName, txn.localDate, txn.status !== 'confirmed' ? txn.status : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Text style={[styles.amt, { color: amtColor }]}>
        {sign}₹{formatINR(txn.amountMinor)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginVertical: 4,
  },
  icon: { fontSize: 20, marginRight: 10 },
  mid: { flex: 1 },
  cp: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 12, marginTop: 2 },
  amt: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
