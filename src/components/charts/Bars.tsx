import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { SeriesBucket } from '@/repositories/reports';
import { useAppTheme } from '@/theme/useTheme';
import { formatINR } from '@/utils/money';

/** Grouped income vs expense mini bars (pure RN, staggered grow). */
export function Bars({
  data,
  height = 120,
  onPick,
}: {
  data: SeriesBucket[];
  height?: number;
  onPick?: (bucket: string) => void;
}) {
  const t = useAppTheme();
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    anim.setValue(0);
    const a = Animated.timing(anim, { toValue: 1, duration: 500, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [data.length, anim]);

  const max = Math.max(1, ...data.map((d) => Math.max(d.incomeMinor, d.expenseMinor)));
  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
      <View style={[styles.row, { height }]}>
        {data.slice(-12).map((d) => (
          <View key={d.bucket} style={styles.col}>
            <View style={styles.pair}>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(2, (d.incomeMinor / max) * (height - 24)),
                    backgroundColor: t.success,
                  },
                ]}
              />
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(2, (d.expenseMinor / max) * (height - 24)),
                    backgroundColor: t.danger,
                  },
                ]}
              />
            </View>
            <Text style={[styles.lbl, { color: t.textMuted }]}>{d.bucket.slice(5)}</Text>
          </View>
        ))}
      </View>
      {data.length === 0 ? (
        <Text style={{ color: t.textMuted }}>No data.</Text>
      ) : (
        <Text style={[styles.foot, { color: t.textMuted }]}>
          Max ₹{formatINR(max)} · green received, red spent
        </Text>
      )}
      {void onPick}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 12, marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  pair: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 8, borderRadius: 3 },
  lbl: { fontSize: 9, marginTop: 4 },
  foot: { fontSize: 11, marginTop: 8 },
});
