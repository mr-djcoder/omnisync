import { View, Text } from 'react-native';
import { useAuth } from '../../src/features/auth/useAuth';

export default function Home() {
  const { signOut } = useAuth();
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-primary text-2xl font-bold">OmniSync</Text>
      <Text className="text-on-surface-variant mt-2">You are signed in.</Text>
      <Text onPress={signOut} className="text-secondary mt-6">
        Sign out
      </Text>
    </View>
  );
}
