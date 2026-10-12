import { Pressable, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '@/theme/useTheme';

export function CategoryChip({
  emoji,
  name,
  selected,
  onPress,
}: {
  emoji: string;
  name: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? t.primary : t.surfaceMuted,
          borderColor: selected ? t.primary : t.border,
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
  },
  text: { fontSize: 14, fontWeight: '600' },
});
