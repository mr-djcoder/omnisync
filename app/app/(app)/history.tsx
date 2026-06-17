import { View, Text, FlatList } from 'react-native';
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
  const { items } = useHistory();
  const insets = useSafeAreaInsets();

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
              <View className="rounded-3xl bg-surface-container overflow-hidden border border-outline-variant p-md gap-sm">
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

                {/* Published text */}
                {item.text ? (
                  <Text className="text-on-surface-variant text-sm leading-5" numberOfLines={4}>
                    {item.text}
                  </Text>
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
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
