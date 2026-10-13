import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ScreenEdge = 'top' | 'bottom' | 'left' | 'right';

export const ALL_EDGES: ScreenEdge[] = ['top', 'bottom', 'left', 'right'];

interface ScreenProps {
  children: ReactNode;
  edges?: ScreenEdge[];
  gutter?: number;
  contentStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

function edgeSet(edges: ScreenEdge[] | undefined): Set<ScreenEdge> {
  return new Set(edges ?? ALL_EDGES);
}

/**
 * Scrollable screen root. Outer ScrollView carries flex + safe-area insets;
 * inner contentContainer adds the gutter + extra bottom clearance for the tab bar.
 */
export function Screen({
  children,
  edges,
  gutter = 16,
  contentStyle,
  contentContainerStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const set = edgeSet(edges);
  const padTop = set.has('top') ? insets.top + 8 : 0;
  const padBottom = set.has('bottom') ? insets.bottom + 24 : 0;
  const padLeft = set.has('left') ? Math.max(insets.left, gutter) : 0;
  const padRight = set.has('right') ? Math.max(insets.right, gutter) : 0;

  return (
    <ScrollView
      style={[
        {
          flex: 1,
          paddingTop: padTop,
          paddingBottom: padBottom,
          paddingLeft: padLeft,
          paddingRight: padRight,
        },
        contentStyle,
      ]}
      contentContainerStyle={[{ paddingBottom: 32 }, contentContainerStyle]}
    >
      {children}
    </ScrollView>
  );
}

/** Static (non-scrolling) screen root. */
export function ScreenView({
  children,
  edges,
  gutter = 16,
  contentStyle,
  contentContainerStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const set = edgeSet(edges);
  const padTop = set.has('top') ? insets.top + 8 : 0;
  const padBottom = set.has('bottom') ? insets.bottom + 24 : 0;
  const padLeft = set.has('left') ? Math.max(insets.left, gutter) : 0;
  const padRight = set.has('right') ? Math.max(insets.right, gutter) : 0;

  return (
    <View
      style={[
        {
          flex: 1,
          paddingTop: padTop,
          paddingBottom: padBottom,
          paddingLeft: padLeft,
          paddingRight: padRight,
        },
        contentStyle,
        contentContainerStyle,
      ]}
    >
      {children}
    </View>
  );
}
