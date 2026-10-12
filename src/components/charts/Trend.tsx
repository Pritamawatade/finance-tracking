import { StyleSheet, Text, View } from 'react-native';
import type { SeriesBucket } from '@/repositories/reports';
import { useAppTheme } from '@/theme/useTheme';
import { formatINR } from '@/utils/money';

/** Cumulative spend trend: current vs previous period ghost (text + bar sparkline). */
export function Trend({
  current,
  previous,
}: {
  current: SeriesBucket[];
  previous: SeriesBucket[];
}) {
  const t = useAppTheme();
  const cum = (rows: SeriesBucket[]): number[] => {
    let s = 0;
    return rows.map((r) => (s += r.expenseMinor));
  };
  const a = cum(current);
  const b = cum(previous);
  const totalA = a.length > 0 ? (a[a.length - 1] as number) : 0;
  const totalB = b.length > 0 ? (b[b.length - 1] as number) : 0;
  const max = Math.max(1, totalA, totalB);
  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
      <Text style={[styles.title, { color: t.text }]}>Cumulative spend</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { flex: totalA / max, backgroundColor: t.primary }]} />
        <View style={{ flex: Math.max(0, 1 - totalA / max) }} />
      </View>
      <Text style={[styles.lbl, { color: t.textMuted }]}>
        This period ₹{formatINR(totalA)}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { flex: totalB / max, backgroundColor: t.textMuted }]} />
        <View style={{ flex: Math.max(0, 1 - totalB / max) }} />
      </View>
      <Text style={[styles.lbl, { color: t.textMuted }]}>
        Previous ₹{formatINR(totalB)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 12, marginVertical: 8 },
  title: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  track: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 6 },
  fill: { borderRadius: 5 },
  lbl: { fontSize: 12, marginTop: 4, fontVariant: ['tabular-nums'] },
});
