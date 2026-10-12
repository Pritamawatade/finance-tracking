import { useEffect } from 'react';
import { router } from 'expo-router';
import { Text } from 'react-native';

/** Fallback route for the center "+" tab; the tab button opens the modal directly. */
export default function AddPlaceholder() {
  useEffect(() => {
    router.replace('/transaction/new');
  }, []);
  return <Text>Opening…</Text>;
}
