import { View, Text, Pressable } from 'react-native';
import { useAuth } from '../../src/features/auth/useAuth';

export default function Profile() {
  const { session, signOut } = useAuth();
  const email = session?.user.email ?? '';
  const username = (session?.user.user_metadata?.username as string | undefined) ?? null;
  const initial = (username ?? email ?? '?').charAt(0).toUpperCase();

  return (
    <View className="flex-1 bg-background px-md pt-xl">
      <Text className="text-primary text-2xl font-bold mb-lg">Profile</Text>

      <View className="items-center mb-xl">
        <View className="w-20 h-20 rounded-full bg-surface-container items-center justify-center mb-md border border-outline-variant">
          <Text className="text-on-surface text-3xl font-bold">{initial}</Text>
        </View>
        {username ? (
          <Text className="text-on-surface text-lg font-semibold">{username}</Text>
        ) : null}
        <Text className="text-on-surface-variant text-sm">{email}</Text>
      </View>

      <View className="flex-1" />

      <Pressable
        onPress={signOut}
        className="border border-error rounded-full py-4 items-center mb-8 active:opacity-80"
      >
        <Text className="text-error font-semibold">Sign out</Text>
      </Pressable>
    </View>
  );
}
