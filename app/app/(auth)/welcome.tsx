import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/features/auth/useAuth';
import { Screen, Button, Icon } from '../../src/ui';

export default function Welcome() {
  const router = useRouter();
  const { signInWithGoogle } = useAuth();

  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-xl">
        {/* Hero */}
        <View className="items-center gap-md">
          <View className="h-20 w-20 items-center justify-center rounded-3xl bg-surface-container border border-outline-variant">
            <Icon name="sync-circle" size={44} color="primary" />
          </View>
          <Text className="text-on-surface text-3xl font-extrabold tracking-tight text-center">
            Welcome to OmniSync
          </Text>
          <Text className="text-on-surface-variant text-center text-base max-w-[280px]">
            The automated multi-publishing engine for creators.
          </Text>
        </View>

        {/* Action card */}
        <View className="w-full max-w-sm rounded-3xl bg-surface-container-low border border-outline-variant p-lg gap-md">
          <Pressable
            accessibilityRole="button"
            onPress={() => signInWithGoogle()}
            className="flex-row items-center justify-center gap-sm rounded-full bg-on-surface py-4 active:opacity-80"
          >
            <Icon name="logo-google" size={18} color="surface" />
            <Text className="text-surface font-semibold">Continue with Google</Text>
          </Pressable>

          <View className="flex-row items-center gap-sm">
            <View className="h-px flex-1 bg-outline-variant" />
            <Text className="text-outline text-xs font-semibold">OR</Text>
            <View className="h-px flex-1 bg-outline-variant" />
          </View>

          <Button
            label="Continue with Email"
            icon="mail-outline"
            onPress={() => router.push('/(auth)/email')}
          />
        </View>

        <Text className="text-outline text-center text-xs px-lg">
          By continuing, you agree to OmniSync&apos;s Terms of Service and Privacy Policy.
        </Text>
      </View>
    </Screen>
  );
}
