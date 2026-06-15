import { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import type { Provider } from '@omnisync/shared';
import { useConnections, setMasterSource } from '../../src/features/connections/useConnections';
import { providerLabel } from '../../src/features/connections/connect';
import { Screen, Card, Button, Icon } from '../../src/ui';
import type { IconName } from '../../src/ui';

const PROVIDER_ICON: Record<Provider, IconName> = {
  facebook: 'logo-facebook',
  instagram: 'logo-instagram',
  tiktok: 'logo-tiktok',
  snapchat: 'logo-snapchat',
};

export default function MasterSource() {
  const router = useRouter();
  const { connections } = useConnections();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const result = await setMasterSource(selected);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.replace('/(onboarding)/success');
  }

  return (
    <Screen scroll>
      {/* Step indicator */}
      <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-widest pt-md">
        Step 3 of 4
      </Text>

      {/* Headline */}
      <Text className="text-on-surface text-3xl font-extrabold tracking-tight mt-xs">
        Choose Your Master Source
      </Text>
      <Text className="text-on-surface-variant text-base mt-xs mb-lg">
        The account OmniSync monitors for new updates to broadcast everywhere.
      </Text>

      {/* Selectable connection cards */}
      <View className="gap-md">
        {connections.map((c) => {
          const active = selected === c.id;
          const icon = PROVIDER_ICON[c.provider as Provider] ?? 'globe-outline';
          return (
            <Card
              key={c.id}
              onPress={() => setSelected(c.id)}
              variant={active ? 'filled' : 'outlined'}
              className={active ? 'bg-primary/10 border border-primary' : ''}
            >
              <View className="flex-row items-center gap-md">
                <View
                  className={`h-12 w-12 items-center justify-center rounded-2xl ${
                    active ? 'bg-primary/15' : 'bg-surface-container-high'
                  }`}
                >
                  <Icon name={icon} size={24} color={active ? 'primary' : 'on-surface-variant'} />
                </View>
                <View className="flex-1">
                  <Text className="text-on-surface text-base font-bold">
                    {providerLabel(c.provider)}
                  </Text>
                  <Text className="text-on-surface-variant text-xs">{c.handle ?? c.id}</Text>
                </View>
                <Icon
                  name={active ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={active ? 'primary' : 'outline'}
                />
              </View>
            </Card>
          );
        })}
      </View>

      {/* Why card */}
      <Card variant="outlined" className="mt-lg">
        <View className="flex-row items-start gap-md">
          <Icon name="information-circle" size={20} color="tertiary" />
          <View className="flex-1">
            <Text className="text-tertiary text-xs font-semibold uppercase tracking-wide mb-xs">
              Why select a master?
            </Text>
            <Text className="text-on-surface-variant text-xs leading-5">
              Your master source is the single source of truth. When you post there, OmniSync
              reformats and pushes that content to every connected channel.
            </Text>
          </View>
        </View>
      </Card>

      {error ? (
        <View className="flex-row items-center gap-sm rounded-2xl bg-error/10 px-md py-sm mt-md">
          <Icon name="alert-circle" size={18} color="error" />
          <Text className="text-error text-sm flex-1">{error}</Text>
        </View>
      ) : null}

      {/* CTA */}
      <View className="mt-xl">
        <Button
          label="Confirm Source"
          icon="checkmark"
          disabled={!selected}
          loading={busy}
          onPress={onConfirm}
        />
      </View>
    </Screen>
  );
}
