import { Tabs } from 'expo-router';

export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#16111b', borderTopColor: '#4d4354' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="drafts" options={{ title: 'Drafts' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="review/[postId]" options={{ href: null }} />
      <Tabs.Screen name="compose" options={{ href: null }} />
    </Tabs>
  );
}
