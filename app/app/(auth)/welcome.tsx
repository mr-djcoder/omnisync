import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/features/auth/useAuth';

export default function Welcome() {
  const router = useRouter();
  const { signInWithGoogle } = useAuth();

  return (
    <View className="flex-1 items-center justify-center bg-background px-md gap-lg">
      <View className="items-center gap-sm">
        <Text className="text-primary text-3xl font-bold">OmniSync</Text>
        <Text className="text-on-surface-variant text-center">
          The automated multi-publishing engine for creators.
        </Text>
      </View>
      <View className="w-full max-w-sm gap-md">
        <Pressable
          accessibilityRole="button"
          className="bg-on-surface rounded-lg py-4 items-center active:opacity-80"
          onPress={() => signInWithGoogle()}
        >
          <Text className="text-background font-semibold">Continue with Google</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="bg-primary rounded-lg py-4 items-center active:opacity-80"
          onPress={() => router.push('/(auth)/email')}
        >
          <Text className="text-on-primary font-semibold">Continue with Email</Text>
        </Pressable>
      </View>
    </View>
  );
}
