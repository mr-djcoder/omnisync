import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, Modal, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHistory } from '../../src/features/history/useHistory';
import { Icon } from '../../src/ui';
import type { IconName } from '../../src/ui';
import type { PublicationVM } from '../../src/features/history/useHistory';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

const PROVIDER_ICON: Record<string, IconName> = {
  facebook: 'logo-facebook',
  instagram: 'logo-instagram',
  tiktok: 'logo-tiktok',
  snapchat: 'logo-snapchat',
};

function platformLabel(provider: string | null, handle: string | null): string {
  const name = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Channel';
  return handle ? `${name} · ${handle}` : name;
}

export default function HistoryScreen() {
  const { items, refresh } = useHistory();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<PublicationVM | null>(null);

  // Refresh when History regains focus so a just-published post shows up.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-md pt-md pb-sm">
        <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-widest">
          Activity
        </Text>
        <Text className="text-on-surface text-3xl font-extrabold tracking-tight">History</Text>
        <Text className="text-on-surface-variant text-sm mt-xs">
          Your most recent publications. View only.
        </Text>
      </View>

      {items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-xl gap-md">
          <View className="h-20 w-20 items-center justify-center rounded-3xl bg-surface-container">
            <Icon name="time-outline" size={32} color="primary" />
          </View>
          <Text className="text-on-surface text-lg font-bold text-center">No publications yet</Text>
          <Text className="text-on-surface-variant text-center text-sm">
            Once you publish a remix to your channels, it will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 24,
            gap: 12,
          }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: PublicationVM }) => {
            const ok = item.status === 'success';
            const skipped = item.status === 'skipped';
            return (
              <Pressable
                onPress={() => setSelected(item)}
                className="rounded-3xl bg-surface-container overflow-hidden border border-outline-variant p-md gap-sm active:opacity-80"
              >
                {/* Platform + date */}
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-xs">
                    <Icon
                      name={(item.provider && PROVIDER_ICON[item.provider]) || 'megaphone-outline'}
                      size={16}
                      color="on-surface-variant"
                    />
                    <Text className="text-on-surface text-sm font-semibold">
                      {platformLabel(item.provider, item.handle)}
                    </Text>
                  </View>
                  <Text className="text-on-surface-variant text-xs">
                    {formatDate(item.published_at)}
                  </Text>
                </View>

                {/* Published text (tap the card to read the full message) */}
                {item.text ? (
                  <Text className="text-on-surface-variant text-sm leading-5" numberOfLines={4}>
                    {item.text}
                  </Text>
                ) : null}
                {item.text && item.text.length > 140 ? (
                  <View className="flex-row items-center gap-xs">
                    <Icon name="expand-outline" size={12} color="primary" />
                    <Text className="text-primary text-[11px] font-semibold">Tap to read full</Text>
                  </View>
                ) : null}

                {/* Status */}
                <View
                  className={`flex-row items-center gap-xs self-start rounded-full px-sm py-xs ${
                    ok ? 'bg-secondary-container' : skipped ? 'bg-surface-container-high' : 'bg-error/15'
                  }`}
                >
                  <Icon
                    name={ok ? 'checkmark-circle' : skipped ? 'remove-circle' : 'close-circle'}
                    size={13}
                    color={ok ? 'on-secondary-container' : skipped ? 'on-surface-variant' : 'error'}
                  />
                  <Text
                    className={`text-[11px] font-semibold uppercase tracking-wide ${
                      ok ? 'text-on-secondary-container' : skipped ? 'text-on-surface-variant' : 'text-error'
                    }`}
                  >
                    {ok ? 'Published' : skipped ? 'Skipped' : 'Failed'}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Full-message viewer */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View
            className="bg-surface-container-high rounded-t-3xl px-lg pt-lg gap-md"
            style={{ paddingBottom: insets.bottom + 24, maxHeight: '80%' }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-xs">
                <Icon
                  name={
                    (selected?.provider && PROVIDER_ICON[selected.provider]) || 'megaphone-outline'
                  }
                  size={18}
                  color="on-surface-variant"
                />
                <Text className="text-on-surface text-base font-bold">
                  {platformLabel(selected?.provider ?? null, selected?.handle ?? null)}
                </Text>
              </View>
              <Pressable
                onPress={() => setSelected(null)}
                className="h-9 w-9 items-center justify-center rounded-full bg-surface-container"
              >
                <Icon name="close" size={18} color="on-surface" />
              </Pressable>
            </View>
            {selected?.published_at ? (
              <Text className="text-on-surface-variant text-xs">
                {formatDate(selected.published_at)}
              </Text>
            ) : null}
            <ScrollView className="mt-xs">
              <Text className="text-on-surface text-[15px] leading-6">
                {selected?.text || 'No message text.'}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
