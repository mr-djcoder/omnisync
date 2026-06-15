import { View, Text } from 'react-native';
import { useAuth } from '../../src/features/auth/useAuth';
import { Screen, Card, Button, Icon } from '../../src/ui';
import type { IconName } from '../../src/ui';

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

      <Card variant="outlined" className="mb-lg">
        <Row icon="mail-outline" label="Email" value={email || '—'} />
        <View className="h-px bg-outline-variant" />
        <Row icon="shield-checkmark-outline" label="Account" value="Active" />
      </Card>

      <Button label="Sign out" icon="log-out-outline" variant="danger" onPress={signOut} />
    </Screen>
  );
}
