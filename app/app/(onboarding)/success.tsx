import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Button, Icon } from '../../src/ui';

export default function Success() {
  const router = useRouter();

  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-xl">
        {/* Celebratory hero */}
        <View className="items-center gap-lg">
          <View className="relative items-center justify-center">
            <View className="absolute h-40 w-40 rounded-full bg-primary/10" />
            <View className="absolute h-32 w-32 rounded-full bg-primary/20" />
            <View className="h-24 w-24 items-center justify-center rounded-full bg-primary-container">
              <Icon name="checkmark-sharp" size={52} color="on-primary-container" />
            </View>
          </View>

          <View className="items-center gap-sm">
            <Text className="text-on-surface text-3xl font-extrabold tracking-tight text-center">
              You&apos;re All Set!
            </Text>
            <Text className="text-on-surface-variant text-center text-base max-w-[300px]">
              Your ecosystem is synchronized and ready for your first broadcast.
            </Text>
          </View>
        </View>

        {/* Live sync status */}
        <Card variant="outlined" className="w-full max-w-sm">
          <View className="flex-row items-center gap-md">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-success/15">
              <Icon name="flash" size={20} color="success" />
            </View>
            <View className="flex-1">
              <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-wide">
                Sync Mode
              </Text>
              <Text className="text-on-surface text-sm font-bold">Real-time automation active</Text>
            </View>
            <View className="flex-row items-center gap-xs rounded-full bg-success/15 px-sm py-xs">
              <View className="h-2 w-2 rounded-full bg-success" />
              <Text className="text-success text-xs font-semibold">LIVE</Text>
            </View>
          </View>
        </Card>

        {/* CTA */}
        <View className="w-full max-w-sm">
          <Button label="Go to Hub" icon="arrow-forward" onPress={() => router.replace('/(app)')} />
        </View>
      </View>
    </Screen>
  );
}
