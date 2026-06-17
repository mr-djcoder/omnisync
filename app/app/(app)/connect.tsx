import { useState, useCallback, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { PROVIDERS, type Provider } from '@omnisync/shared';
import {
  providerLabel,
  isWired,
  connectFacebook,
  addScrapeSource,
} from '../../src/features/connections/connect';
import { useConnections, setMasterSource } from '../../src/features/connections/useConnections';
import { supabase } from '../../src/lib/supabase';
import { Screen, Card, Button, Field, Icon } from '../../src/ui';
import type { IconName } from '../../src/ui';

const PROVIDER_ICON: Record<Provider, IconName> = {
  facebook: 'logo-facebook',
  instagram: 'logo-instagram',
  tiktok: 'logo-tiktok',
  snapchat: 'logo-snapchat',
};

export default function ConnectTab() {
  const { connections, refresh } = useConnections();
  const [masterId, setMasterId] = useState<string | null>(null);
  const [savingMaster, setSavingMaster] = useState<string | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeAdding, setScrapeAdding] = useState(false);

  const loadMaster = useCallback(async () => {
    const { data } = await supabase.from('master_source').select('connection_id').maybeSingle();
    setMasterId(data?.connection_id ?? null);
  }, []);

  useEffect(() => {
    loadMaster();
  }, [loadMaster]);

  // Re-fetch when the screen regains focus (e.g. returning from the Facebook
  // OAuth browser) so a newly connected account shows up immediately.
  useFocusEffect(
    useCallback(() => {
      refresh();
      loadMaster();
    }, [refresh, loadMaster]),
  );

  async function chooseMaster(id: string) {
    setSavingMaster(id);
    const { error } = await setMasterSource(id);
    if (!error) setMasterId(id);
    setSavingMaster(null);
  }

  async function onConnect(p: Provider) {
    if (!isWired(p)) return;
    setBusy(p);
    setConnectError(null);
    if (p === 'facebook') {
      const result = await connectFacebook();
      if (result.error && result.error !== 'cancelled') {
        setConnectError(result.error);
      } else if (result.connected === 0) {
        setConnectError(
          'No Facebook Pages found on that account. You must be an admin of a Page to connect it.',
        );
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

  return (
    <Screen scroll>
      <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-widest pt-md">
        Channels
      </Text>
      <Text className="text-on-surface text-3xl font-extrabold tracking-tight mt-xs">Connect</Text>
      <Text className="text-on-surface-variant text-base mt-xs mb-lg">
        Pick the master OmniSync monitors. Every other channel receives the broadcast.
      </Text>

      {/* Connected channels with master/target routing */}
      {connections.length === 0 ? (
        <Card variant="outlined" className="items-center gap-sm py-lg mb-lg">
          <View className="h-14 w-14 items-center justify-center rounded-3xl bg-surface-container-high">
            <Icon name="git-network-outline" size={26} color="primary" />
          </View>
          <Text className="text-on-surface font-bold">No channels yet</Text>
          <Text className="text-on-surface-variant text-sm text-center px-md">
            Connect an account or add a public page below to get started.
          </Text>
        </Card>
      ) : (
        <View className="gap-md mb-lg">
          {connections.map((c) => {
            const isMaster = masterId === c.id;
            const icon = PROVIDER_ICON[c.provider as Provider] ?? 'globe-outline';
            return (
              <Card
                key={c.id}
                variant={isMaster ? 'filled' : 'outlined'}
                className={isMaster ? 'border border-primary' : ''}
              >
                <View className="flex-row items-center gap-md">
                  <View
                    className={`h-12 w-12 items-center justify-center rounded-2xl ${
                      isMaster ? 'bg-primary/15' : 'bg-surface-container-high'
                    }`}
                  >
                    <Icon
                      name={icon}
                      size={24}
                      color={isMaster ? 'primary' : 'on-surface-variant'}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-on-surface text-base font-bold">
                      {providerLabel(c.provider as Provider)}
                    </Text>
                    <Text className="text-on-surface-variant text-xs">{c.handle ?? c.id}</Text>
                  </View>
                  {isMaster ? (
                    <View className="flex-row items-center gap-xs rounded-full bg-primary px-md py-xs">
                      <Icon name="star" size={13} color="on-primary" />
                      <Text className="text-on-primary text-xs font-semibold">Master</Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-xs rounded-full bg-secondary-container px-md py-xs">
                      <Icon name="send" size={12} color="on-secondary" />
                      <Text className="text-on-secondary text-xs font-semibold">Target</Text>
                    </View>
                  )}
                </View>
                {!isMaster ? (
                  <Button
                    label="Set as master"
                    icon="star-outline"
                    variant="ghost"
                    size="md"
                    fullWidth={false}
                    loading={savingMaster === c.id}
                    onPress={() => chooseMaster(c.id)}
                    className="mt-sm self-start"
                  />
                ) : null}
              </Card>
            );
          })}
        </View>
      )}

      {connectError ? (
        <View className="flex-row items-center gap-sm rounded-2xl bg-error/10 px-md py-sm mb-md">
          <Icon name="alert-circle" size={18} color="error" />
          <Text className="text-error text-sm flex-1">{connectError}</Text>
        </View>
      ) : null}

      {/* Add publish channels. Facebook can be connected multiple times (one
          per Page/account); other providers are coming soon. */}
      <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-wide mb-sm">
        Add a channel to publish to
      </Text>
      <View className="gap-md mb-lg">
        {PROVIDERS.map((p) => {
          const wired = isWired(p);
          // Instagram has no standalone connect button — it's discovered via the
          // linked Facebook Page during the Facebook connect flow.
          const isIg = p === 'instagram';
          const fbCount = p === 'facebook' ? connections.filter((c) => c.provider === p).length : 0;
          return (
            <Card key={p} variant="outlined">
              <View className="flex-row items-center gap-md">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-surface-container-high">
                  <Icon name={PROVIDER_ICON[p]} size={24} color="on-surface-variant" />
                </View>
                <View className="flex-1">
                  <Text className="text-on-surface text-base font-bold">{providerLabel(p)}</Text>
                  <Text className="text-on-surface-variant text-xs">
                    {isIg
                      ? 'Connects automatically with its linked Facebook Page'
                      : wired
                        ? fbCount > 0
                          ? `${fbCount} connected · add another account`
                          : 'Connect an account to publish'
                        : 'Coming soon'}
                  </Text>
                </View>
                {isIg ? (
                  <View className="flex-row items-center gap-xs">
                    <Icon name="logo-facebook" size={14} color="on-surface-variant" />
                    <Text className="text-on-surface-variant text-xs font-semibold">Auto</Text>
                  </View>
                ) : wired ? (
                  <Button
                    label={fbCount > 0 ? 'Add' : 'Connect'}
                    icon="add"
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

      {/* Add by URL */}
      <Card variant="filled" className="bg-primary/5 border border-primary/20">
        <View className="flex-row items-center gap-sm mb-sm">
          <Icon name="link" size={18} color="primary" />
          <Text className="text-on-surface text-base font-bold">Add a public Facebook Page</Text>
        </View>
        <Text className="text-on-surface-variant text-xs mb-sm">
          Paste a public page URL to track it without connecting an account.
        </Text>
        <View className="flex-row items-start gap-xs rounded-xl bg-tertiary/10 px-sm py-xs mb-md">
          <Icon name="information-circle" size={14} color="tertiary" />
          <Text className="text-tertiary text-[11px] flex-1">
            Only for your Master source — the page OmniSync monitors. To publish to a page, connect
            a Facebook account above.
          </Text>
        </View>
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
    </Screen>
  );
}
