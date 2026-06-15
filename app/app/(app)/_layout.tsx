import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';

type IoniconName = keyof typeof Ionicons.glyphMap;

// Outline when inactive, solid when focused — reads well in light and dark.
function glyph(focused: boolean, base: string): IoniconName {
  return (focused ? base : `${base}-outline`) as IoniconName;
}

export default function AppTabs() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors['surface-container-low'],
          borderTopColor: colors['outline-variant'],
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors['on-surface-variant'],
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={glyph(focused, 'home')} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="drafts"
        options={{
          title: 'Drafts',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={glyph(focused, 'create')} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={glyph(focused, 'time')} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={glyph(focused, 'person')} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="review/[postId]" options={{ href: null }} />
      <Tabs.Screen name="compose" options={{ href: null }} />
    </Tabs>
  );
}
