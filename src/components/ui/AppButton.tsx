import { Pressable, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '@/theme/useTheme';

interface AppButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  accessibilityLabel?: string;
}

/** Full-width button with 52pt min touch target + pressed opacity feedback. */
export function AppButton({ title, onPress, disabled, danger, accessibilityLabel }: AppButtonProps) {
  const t = useAppTheme();
  const bg = disabled ? t.textMuted : danger ? t.danger : t.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled ?? false }}
      android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: pressed ? 0.7 : disabled ? 0.5 : 1 },
      ]}
    >
      <Text style={styles.label}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  label: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
