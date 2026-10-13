import { useEffect } from 'react';
import { router } from 'expo-router';
import { Text } from 'react-native';
import { ScreenView } from '@/components/ui/Screen';
import { useAppTheme } from '@/theme/useTheme';

/** Fallback route for the center "+" tab; the tab button opens the modal directly. */
export default function AddPlaceholder() {
  const t = useAppTheme();
  useEffect(() => {
    router.replace('/transaction/new');
  }, []);
  return (
    <ScreenView contentStyle={{ backgroundColor: t.background }}>
      <Text style={{ color: t.text }}>Opening…</Text>
    </ScreenView>
  );
}
