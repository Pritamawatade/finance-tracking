import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/useTheme';

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  const t = useAppTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      {hint ? <Text style={[styles.hint, { color: t.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 13, marginTop: 6, textAlign: 'center' },
});
