import { View, Text, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useDrafts } from '../../src/features/drafts/useDrafts';

export default function DraftsList() {
  const { drafts } = useDrafts();
  const router = useRouter();

  return (
    <View className="flex-1 bg-background">
      <View className="px-md pt-xl pb-md flex-row items-center justify-between">
        <Text className="text-primary text-2xl font-bold">Drafts</Text>
        <Pressable
          onPress={() => router.push('/(app)/compose')}
          className="bg-primary rounded-md px-md py-xs"
        >
          <Text className="text-on-primary text-sm font-semibold">+ Create</Text>
        </Pressable>
      </View>

      {drafts.length === 0 ? (
        <View className="flex-1 items-center justify-center px-md">
          <Text className="text-on-surface-variant text-center">
            No drafts yet. Remix a source post or create a new one.
          </Text>
        </View>
      ) : (
        <FlatList
          data={drafts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/(app)/review/${item.id}`)}
              className="bg-surface-container rounded-lg px-md py-sm mb-sm border border-outline-variant"
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-on-surface text-sm font-semibold capitalize">
                  {item.origin}
                </Text>
                <Text className="text-on-surface-variant text-xs capitalize">{item.status}</Text>
              </View>
              {item.source_post_id ? (
                <Text className="text-on-surface-variant text-xs mt-xs" numberOfLines={1}>
                  Source: {item.source_post_id}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
