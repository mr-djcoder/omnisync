import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { PROVIDERS, type Provider } from '@omnisync/shared';
import { providerLabel, isWired, connectFacebook } from '../../src/features/connections/connect';
import { useConnections } from '../../src/features/connections/useConnections';

export default function Connect() {
  const router = useRouter();
  const { connections, refresh } = useConnections();
  const [busy, setBusy] = useState<Provider | null>(null);

  async function onConnect(p: Provider) {
    if (!isWired(p)) return;
    setBusy(p);
    if (p === 'facebook') await connectFacebook();
    await refresh();
    setBusy(null);
  }

  const hasAny = connections.length > 0;

  return (
    <View className="flex-1 bg-background pt-16 px-md">
      <Text className="text-on-surface text-2xl font-bold mb-1">Connect Your Channels</Text>
      <Text className="text-on-surface-variant mb-6">
        Link your social profiles to start syncing your content.
      </Text>
      <ScrollView className="flex-1">
        {PROVIDERS.map((p) => {
          const connected = connections.some((c) => c.provider === p);
          return (
            <View
              key={p}
              className="flex-row items-center justify-between bg-surface-container rounded-xl p-md mb-gutter"
            >
              <Text className="text-on-surface font-semibold">{providerLabel(p)}</Text>
              {connected ? (
                <Text className="text-secondary">Connected</Text>
              ) : isWired(p) ? (
                <Pressable
                  className="border border-secondary rounded-full px-lg py-sm active:opacity-80"
                  onPress={() => onConnect(p)}
                >
                  <Text className="text-secondary">{busy === p ? '…' : 'Connect'}</Text>
                </Pressable>
              ) : (
                <Text className="text-outline">Coming soon</Text>
              )}
            </View>
          );
        })}
      </ScrollView>
      <Pressable
        disabled={!hasAny}
        className={`rounded-full py-4 items-center mb-8 ${hasAny ? 'bg-primary' : 'bg-surface-container'}`}
        onPress={() => router.push('/(onboarding)/master-source')}
      >
        <Text className={hasAny ? 'text-on-primary font-semibold' : 'text-outline'}>Next Step</Text>
      </Pressable>
    </View>
  );
}
