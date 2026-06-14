import { View, Text, FlatList } from 'react-native';
import { useHistory } from '../../src/features/history/useHistory';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function HistoryScreen() {
  const { items } = useHistory();

  return (
    <View className="flex-1 bg-background px-md pt-xl">
      <Text className="text-primary font-bold text-xl mb-md">History</Text>
      {items.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-on-surface-variant text-center">No publications yet.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View className="bg-surface-container rounded-lg p-md mb-sm border border-outline-variant">
              <View className="flex-row items-center justify-between mb-xs">
                <Text
                  className="text-sm font-semibold"
                  style={{ color: item.status === 'success' ? '#4caf50' : '#f44336' }}
                >
                  {item.status === 'success' ? 'Published' : 'Failed'}
                </Text>
                <Text className="text-on-surface-variant text-xs">
                  {formatDate(item.published_at)}
                </Text>
              </View>
              {item.external_post_id ? (
                <Text className="text-on-surface-variant text-xs" numberOfLines={1}>
                  Post ID: {item.external_post_id}
                </Text>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}
