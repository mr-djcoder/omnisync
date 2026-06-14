import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useConnections, setMasterSource } from '../../src/features/connections/useConnections';
import { providerLabel } from '../../src/features/connections/connect';

export default function MasterSource() {
  const router = useRouter();
  const { connections } = useConnections();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    if (!selected) return;
    setBusy(true);
    await setMasterSource(selected);
    setBusy(false);
    router.replace('/(onboarding)/success');
  }

  return (
    <View className="flex-1 bg-background pt-16 px-md">
      <Text className="text-on-surface text-2xl font-bold mb-1">Choose Your Master Source</Text>
      <Text className="text-on-surface-variant mb-6">
        The account OmniSync monitors for new updates to broadcast.
      </Text>
      <ScrollView className="flex-1">
        {connections.map((c) => {
          const active = selected === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => setSelected(c.id)}
              className={`bg-surface-container rounded-xl p-md mb-gutter border ${active ? 'border-secondary' : 'border-outline-variant'}`}
            >
              <Text className="text-on-surface font-semibold">{providerLabel(c.provider)}</Text>
              <Text className="text-on-surface-variant">{c.handle ?? c.id}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        disabled={!selected || busy}
        className={`rounded-full py-4 items-center mb-8 ${selected ? 'bg-primary' : 'bg-surface-container'}`}
        onPress={onConfirm}
      >
        <Text className={selected ? 'text-on-primary font-semibold' : 'text-outline'}>
          {busy ? '…' : 'Confirm Source'}
        </Text>
      </Pressable>
    </View>
  );
}
