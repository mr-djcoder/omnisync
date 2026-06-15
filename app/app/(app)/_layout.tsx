import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type IoniconName = keyof typeof Ionicons.glyphMap;

// Outline when inactive, solid when focused — reads well in both light and dark.
function icon(focused: boolean, base: string): IoniconName {
  return (focused ? base : `${base}-outline`) as IoniconName;
}

export default function AppTabs() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  const theme = {
    background: dark ? '#16111b' : '#ffffff',
    border: dark ? '#2a2430' : '#e6e0eb',
    active: dark ? '#ddb7ff' : '#7c3aed',
    inactive: dark ? '#8a7f96' : '#79747e',
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: theme.active,
        tabBarInactiveTintColor: theme.inactive,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={icon(focused, 'home')} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="drafts"
        options={{
          title: 'Drafts',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={icon(focused, 'create')} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={icon(focused, 'time')} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={icon(focused, 'person')} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="review/[postId]" options={{ href: null }} />
      <Tabs.Screen name="compose" options={{ href: null }} />
    </Tabs>
  );
}
