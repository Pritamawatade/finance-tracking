import { Text } from 'react-native';
import { Tabs, router } from 'expo-router';
import { usePendingCount } from '@/hooks/useReports';

export default function TabsLayout() {
  const pending = usePendingCount();
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <Text>{focused ? '🏠' : '🏡'}</Text>,
          tabBarBadge: pending > 0 ? pending : undefined,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{ title: 'Transactions', tabBarIcon: () => <Text>🧾</Text> }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: '+',
          tabBarIcon: () => <Text style={{ fontSize: 24 }}>＋</Text>,
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
        options={{ title: 'Insights', tabBarIcon: () => <Text>📊</Text> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: () => <Text>⚙️</Text> }}
      />
    </Tabs>
  );
}
