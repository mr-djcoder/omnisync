import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { PROVIDERS, type Provider } from '@omnisync/shared';
import {
  providerLabel,
  isWired,
  connectFacebook,
  addScrapeSource,
} from '../../src/features/connections/connect';
import { useConnections } from '../../src/features/connections/useConnections';

export default function Connect() {
  const router = useRouter();
  const { connections, refresh } = useConnections();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeAdding, setScrapeAdding] = useState(false);

  async function onConnect(p: Provider) {
    if (!isWired(p)) return;
    setBusy(p);
    setConnectError(null);
    if (p === 'facebook') {
      const result = await connectFacebook();
      if (result.error && result.error !== 'cancelled') {
        setConnectError(result.error);
      }
    }
    await refresh();
    setBusy(null);
  }

  async function onAddScrape() {
    setScrapeError(null);
    setScrapeAdding(true);
    const result = await addScrapeSource(scrapeUrl);
    if (result.error) {
      setScrapeError(result.error);
    } else {
      setScrapeUrl('');
      await refresh();
    }
    setScrapeAdding(false);
  }

  const hasAny = connections.length > 0;

  return (
    <View className="flex-1 bg-background pt-16 px-md">
      <Text className="text-on-surface text-2xl font-bold mb-1">Connect Your Channels</Text>
      <Text className="text-on-surface-variant mb-6">
        Link your social profiles to start syncing your content.
      </Text>
      {connectError ? <Text className="text-error mb-4">{connectError}</Text> : null}
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

        <View className="bg-surface-container rounded-xl p-md mb-gutter">
          <Text className="text-on-surface font-semibold mb-sm">Add a public Facebook Page URL</Text>
          <TextInput
            className="border border-outline-variant rounded-lg px-md py-sm text-on-surface mb-sm"
            placeholder="https://www.facebook.com/pagename"
            placeholderTextColor="#888"
            value={scrapeUrl}
            onChangeText={setScrapeUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {scrapeError ? <Text className="text-error mb-sm">{scrapeError}</Text> : null}
          <Pressable
            className="border border-secondary rounded-full px-lg py-sm active:opacity-80 self-start"
            onPress={onAddScrape}
            disabled={scrapeAdding}
          >
            <Text className="text-secondary">{scrapeAdding ? '…' : 'Add'}</Text>
          </Pressable>
        </View>
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
