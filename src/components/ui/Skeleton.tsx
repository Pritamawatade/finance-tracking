import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/theme/useTheme';

export function Skeleton({ height = 64 }: { height?: number }) {
  const t = useAppTheme();
  const [opacity] = useState(() => new Animated.Value(0.4));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[styles.box, { height, backgroundColor: t.surfaceMuted, opacity }]}
    >
      <View />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, marginVertical: 6 },
});
