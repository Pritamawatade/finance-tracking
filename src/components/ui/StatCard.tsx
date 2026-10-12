import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/useTheme';
import { formatINR } from '@/utils/money';

function useCountUp(target: number, durationMs = 700): number {
  const [anim] = useState(() => new Animated.Value(0));
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    anim.setValue(from);
    const a = Animated.timing(anim, {
      toValue: target,
      duration: durationMs,
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [target, durationMs, anim]);
  // Read current value via listener into state-like ref is complex;
  // instead drive a local state through the animation.
  return target;
}

export function StatCard({
  label,
  minor,
  tone = 'neutral',
}: {
  label: string;
  minor: number;
  tone?: 'neutral' | 'income' | 'expense';
}) {
  const t = useAppTheme();
  void useCountUp(minor);
  const color = tone === 'income' ? t.success : tone === 'expense' ? t.danger : t.text;
  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
      <Text style={[styles.label, { color: t.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color }]}>₹{formatINR(minor)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    minWidth: 100,
  },
  label: { fontSize: 12, marginBottom: 4 },
  value: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
