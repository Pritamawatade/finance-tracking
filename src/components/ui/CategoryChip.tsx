import { Pressable, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '@/theme/useTheme';

export function CategoryChip({
  emoji,
  name,
  selected,
  onPress,
  accessibilityLabel,
}: {
  emoji: string;
  name: string;
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${name} category`}
      android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? t.primary : t.surfaceMuted,
          borderColor: selected ? t.primary : t.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.text, { color: selected ? '#fff' : t.text }]}>
        {emoji} {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  text: { fontSize: 14, fontWeight: '600' },
});
