import { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BreakdownRow } from '@/repositories/reports';
import { useAppTheme } from '@/theme/useTheme';
import { formatINR } from '@/utils/money';

/**
 * Lightweight animated donut (pure RN views — victory-native fallback).
 * Renders horizontal stacked segments with an animated sweep + legend.
 * Tapping a row selects it (center label shows name + amount).
 */
export function Donut({
  rows,
  selectedId,
  onSelect,
}: {
  rows: BreakdownRow[];
  selectedId?: number | null;
  onSelect?: (id: number | null) => void;
}) {
  const t = useAppTheme();
  const [progress] = useState(() => new Animated.Value(0));
  const [sel, setSel] = useState<number | null>(selectedId ?? null);
  useEffect(() => {
    progress.setValue(0);
    const a = Animated.timing(progress, {
      toValue: 1,
      duration: 900,
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [rows.length, progress]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.totalMinor, 0), [rows]);
  const selected = rows.find((r) => r.categoryId === sel) ?? null;

  if (rows.length === 0 || total <= 0) {
    return (
      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <Text style={{ color: t.textMuted }}>No spending yet this period.</Text>
      </View>
    );
  }

  const pick = (id: number | null) => {
    setSel(id);
    onSelect?.(id);
  };

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
      <View style={styles.center}>
        <Text style={[styles.centerAmt, { color: t.text }]}>
          ₹{formatINR(selected ? selected.totalMinor : total)}
        </Text>
        <Text style={[styles.centerName, { color: t.textMuted }]}>
          {selected ? selected.name : 'Total'}
        </Text>
      </View>
      <View style={styles.bar}>
        {rows.map((r) => (
          <View
            key={String(r.categoryId ?? r.name)}
            style={{
              flex: r.totalMinor / total,
              backgroundColor: r.color,
              opacity: sel === null || sel === r.categoryId ? 1 : 0.35,
            }}
          />
        ))}
      </View>
      {rows.map((r) => {
        const pct = ((r.totalMinor / total) * 100).toFixed(1);
        const active = sel === r.categoryId;
        return (
          <Pressable
            key={String(r.categoryId ?? r.name)}
            onPress={() => pick(active ? null : r.categoryId)}
            style={[styles.row, active && { backgroundColor: t.surfaceMuted }]}
          >
            <Text style={styles.icon}>{r.icon}</Text>
            <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
              {r.name}
            </Text>
            <Text style={[styles.pct, { color: t.textMuted }]}>{pct}%</Text>
            <Text style={[styles.amt, { color: t.text }]}>₹{formatINR(r.totalMinor)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 12, marginVertical: 8 },
  center: { alignItems: 'center', marginBottom: 10 },
  centerAmt: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  centerName: { fontSize: 13, marginTop: 2 },
  bar: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 6, borderRadius: 8 },
  icon: { fontSize: 16, marginRight: 8 },
  name: { flex: 1, fontSize: 14, fontWeight: '600' },
  pct: { fontSize: 12, marginRight: 8, fontVariant: ['tabular-nums'] },
  amt: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
