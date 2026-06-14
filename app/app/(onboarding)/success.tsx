import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export default function Success() {
  const router = useRouter();
  return (
    <View className="flex-1 bg-background items-center justify-center px-md gap-lg">
      <Text className="text-primary text-3xl font-bold">You're All Set!</Text>
      <Text className="text-on-surface-variant text-center">
        Your ecosystem is synchronized and ready for your first broadcast.
      </Text>
      <Pressable
        className="bg-primary rounded-full py-4 px-12 items-center active:opacity-80"
        onPress={() => router.replace('/(app)')}
      >
        <Text className="text-on-primary font-semibold">Go to Hub</Text>
      </Pressable>
    </View>
  );
}
