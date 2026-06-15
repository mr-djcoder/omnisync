import { View, Text, Pressable } from 'react-native';
import { useAuth } from '../../src/features/auth/useAuth';
import { Screen, Card, Button, Icon } from '../../src/ui';
import type { IconName } from '../../src/ui';
import { useThemePref, type ThemePref } from '../../theme/ThemeContext';

function Row({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-md py-sm">
      <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high">
        <Icon name={icon} size={18} color="on-surface-variant" />
      </View>
      <View className="flex-1">
        <Text className="text-on-surface-variant text-xs">{label}</Text>
        <Text className="text-on-surface text-sm font-medium">{value}</Text>
      </View>
    </View>
  );
}

const THEME_OPTIONS: { value: ThemePref; label: string; icon: IconName }[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

function ThemeToggle() {
  const { pref, setPref } = useThemePref();
  return (
    <View className="mb-lg">
      <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-wide mb-sm">
        Appearance
      </Text>
      <View className="flex-row gap-xs rounded-full bg-surface-container p-xs">
        {THEME_OPTIONS.map((opt) => {
          const active = pref === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setPref(opt.value)}
              className={`flex-1 flex-row items-center justify-center gap-xs rounded-full py-sm ${
                active ? 'bg-primary' : 'active:opacity-70'
              }`}
            >
              <Icon
                name={opt.icon}
                size={16}
                color={active ? 'on-primary' : 'on-surface-variant'}
              />
              <Text
                className={`text-sm font-semibold ${active ? 'text-on-primary' : 'text-on-surface-variant'}`}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function Profile() {
  const { session, signOut } = useAuth();
  const email = session?.user.email ?? '';
  const username = (session?.user.user_metadata?.username as string | undefined) ?? null;
  const initial = (username ?? email ?? '?').charAt(0).toUpperCase();

  return (
    <Screen scroll>
      <Text className="text-on-surface text-3xl font-extrabold tracking-tight pt-md pb-lg">
        Profile
      </Text>

      {/* Identity */}
      <View className="items-center gap-sm mb-lg">
        <View className="h-24 w-24 items-center justify-center rounded-full bg-primary-container">
          <Text className="text-on-primary-container text-4xl font-extrabold">{initial}</Text>
        </View>
        {username ? <Text className="text-on-surface text-xl font-bold">{username}</Text> : null}
        <Text className="text-on-surface-variant text-sm">{email}</Text>
      </View>

      <ThemeToggle />

      <Card variant="outlined" className="mb-lg">
        <Row icon="mail-outline" label="Email" value={email || '—'} />
        <View className="h-px bg-outline-variant" />
        <Row icon="shield-checkmark-outline" label="Account" value="Active" />
      </Card>

      <Button label="Sign out" icon="log-out-outline" variant="danger" onPress={signOut} />
    </Screen>
  );
}
