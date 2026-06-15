import { View, Text, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHistory } from '../../src/features/history/useHistory';
import { Icon } from '../../src/ui';
import type { PublicationVM } from '../../src/features/history/useHistory';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
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
            return (
              <View className="rounded-3xl bg-surface-container overflow-hidden border border-outline-variant">
                <View className="p-md flex-row items-start gap-md">
                  {/* Timeline status badge */}
                  <View
                    className={`h-11 w-11 items-center justify-center rounded-full ${
                      ok ? 'bg-secondary-container' : 'bg-error/15'
                    }`}
                  >
                    <Icon
                      name={ok ? 'checkmark-circle' : 'close-circle'}
                      size={22}
                      color={ok ? 'on-secondary-container' : 'error'}
                    />
                  </View>

                  <View className="flex-1">
                    <View className="flex-row items-center justify-between">
                      <View
                        className={`flex-row items-center gap-xs rounded-full px-sm py-xs ${
                          ok ? 'bg-secondary-container' : 'bg-error/15'
                        }`}
                      >
                        <Text
                          className={`text-[11px] font-semibold uppercase tracking-wide ${
                            ok ? 'text-on-secondary-container' : 'text-error'
                          }`}
                        >
                          {ok ? 'Published' : 'Failed'}
                        </Text>
                      </View>
                      <Text className="text-on-surface-variant text-xs">
                        {formatDate(item.published_at)}
                      </Text>
                    </View>

                    {item.external_post_id ? (
                      <View className="flex-row items-center gap-xs mt-sm">
                        <Icon name="link-outline" size={14} color="on-surface-variant" />
                        <Text className="text-on-surface-variant text-xs flex-1" numberOfLines={1}>
                          Post ID: {item.external_post_id}
                        </Text>
                      </View>
                    ) : (
                      <Text className="text-on-surface-variant text-xs mt-sm">
                        {ok ? 'Delivered to channel.' : 'Delivery did not complete.'}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
