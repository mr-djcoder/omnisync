import { View, Text } from 'react-native';

export default function Welcome() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-primary text-2xl font-bold">OmniSync</Text>
      <Text className="text-on-surface-variant mt-2">
        The automated multi-publishing engine for creators.
      </Text>
    </View>
  );
}
