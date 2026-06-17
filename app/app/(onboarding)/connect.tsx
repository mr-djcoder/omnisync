import { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { PROVIDERS, type Provider } from '@omnisync/shared';
import {
  providerLabel,
  isWired,
  connectFacebook,
  addScrapeSource,
} from '../../src/features/connections/connect';
import { useConnections } from '../../src/features/connections/useConnections';
import { Screen, Card, Button, Field, Icon } from '../../src/ui';
import type { IconName } from '../../src/ui';

const PROVIDER_META: Record<Provider, { icon: IconName; subtitle: string }> = {
  facebook: { icon: 'logo-facebook', subtitle: 'Pages and Groups' },
  instagram: { icon: 'logo-instagram', subtitle: 'Business and Creator' },
  tiktok: { icon: 'logo-tiktok', subtitle: 'Content Sync' },
  snapchat: { icon: 'logo-snapchat', subtitle: 'Public Profiles' },
};

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
    <Screen scroll>
      {/* Step indicator */}
      <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-widest pt-md">
        Step 2 of 4
      </Text>

      {/* Headline */}
      <Text className="text-on-surface text-3xl font-extrabold tracking-tight mt-xs">
        Connect Your Channels
      </Text>
      <Text className="text-on-surface-variant text-base mt-xs mb-lg">
        Link your social profiles to start syncing your content across the web.
      </Text>

      {connectError ? (
        <View className="flex-row items-center gap-sm rounded-2xl bg-error/10 px-md py-sm mb-md">
          <Icon name="alert-circle" size={18} color="error" />
          <Text className="text-error text-sm flex-1">{connectError}</Text>
        </View>
      ) : null}

      {/* Provider list */}
      <View className="gap-md">
        {PROVIDERS.map((p) => {
          const meta = PROVIDER_META[p];
          const connected = connections.some((c) => c.provider === p);
          const wired = isWired(p);
          return (
            <Card key={p} variant="outlined">
              <View className="flex-row items-center gap-md">
                <View
                  className={`h-12 w-12 items-center justify-center rounded-2xl ${
                    connected ? 'bg-success/15' : 'bg-surface-container-high'
                  }`}
                >
                  <Icon
                    name={meta.icon}
                    size={24}
                    color={connected ? 'success' : 'on-surface-variant'}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-on-surface text-base font-bold">{providerLabel(p)}</Text>
                  <Text className="text-on-surface-variant text-xs">{meta.subtitle}</Text>
                </View>
                {connected ? (
                  <View className="flex-row items-center gap-xs rounded-full bg-success/15 px-md py-xs">
                    <Icon name="checkmark-circle" size={16} color="success" />
                    <Text className="text-success text-xs font-semibold">Connected</Text>
                  </View>
                ) : wired ? (
                  <Button
                    label="Connect"
                    variant="outline"
                    size="md"
                    fullWidth={false}
                    loading={busy === p}
                    onPress={() => onConnect(p)}
                  />
                ) : (
                  <Text className="text-outline text-xs font-semibold">Coming soon</Text>
                )}
              </View>
            </Card>
          );
        })}
      </View>

      {/* Add by URL — highlighted section */}
      <Card variant="filled" className="mt-lg bg-primary/5 border border-primary/20">
        <View className="flex-row items-center gap-sm mb-sm">
          <Icon name="link" size={18} color="primary" />
          <Text className="text-on-surface text-base font-bold">Add a public Facebook Page</Text>
        </View>
        <Text className="text-on-surface-variant text-xs mb-md">
          Paste a public page URL to track it without connecting an account.
        </Text>
        <Field
          placeholder="https://www.facebook.com/pagename"
          value={scrapeUrl}
          onChangeText={setScrapeUrl}
          error={scrapeError}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Button
          label="Add page"
          icon="add"
          variant="tonal"
          size="md"
          fullWidth={false}
          loading={scrapeAdding}
          onPress={onAddScrape}
          className="mt-md"
        />
      </Card>

      {/* Footer CTA */}
      <View className="mt-xl gap-sm">
        <Button
          label="Next Step"
          icon="arrow-forward"
          disabled={!hasAny}
          onPress={() => router.push('/(onboarding)/master-source')}
        />
        {!hasAny ? (
          <Text className="text-on-surface-variant text-xs text-center">
            Connect at least one channel to proceed.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
