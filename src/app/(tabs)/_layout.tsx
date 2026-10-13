import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePendingCount } from '@/hooks/useReports';
import { useAppTheme } from '@/theme/useTheme';

export default function TabsLayout() {
  const pending = usePendingCount();
  const t = useAppTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: { height: 60, backgroundColor: t.card, borderTopColor: t.border },
        tabBarLabelStyle: { fontSize: 11 },
        tabBarItemStyle: { paddingHorizontal: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
          ),
          tabBarBadge: pending > 0 ? pending : undefined,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarLabel: 'Activity',
          tabBarIcon: ({ color }) => <Ionicons name="receipt-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: '+',
          tabBarIcon: () => <Ionicons name="add-circle" size={30} color={t.primary} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/transaction/new');
          },
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'bar-chart' : 'bar-chart-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
