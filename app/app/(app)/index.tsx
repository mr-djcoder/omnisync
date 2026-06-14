import { useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/features/auth/useAuth';
import { useSourceFeed } from '../../src/features/drafts/useSourceFeed';
import { generateForPost } from '../../src/features/drafts/useDrafts';
import type { SourcePostVM } from '../../src/features/drafts/types';

export default function Home() {
  const { signOut } = useAuth();
  const { posts, loading } = useSourceFeed();
  const router = useRouter();
  const [remixing, setRemixing] = useState<string | null>(null);
  const [remixError, setRemixError] = useState<string | null>(null);

  async function handleRemix(post: SourcePostVM) {
    setRemixing(post.id);
    setRemixError(null);
    const { draftId, error } = await generateForPost(post.id);
    setRemixing(null);
    if (error || !draftId) {
      setRemixError(error ?? 'Unknown error');
      return;
    }
    router.push(`/(app)/review/${draftId}`);
  }

  return (
    <View className="flex-1 bg-background">
      <View className="px-md pt-xl pb-md flex-row items-center justify-between">
        <Text className="text-primary text-2xl font-bold">OmniSync</Text>
        <Pressable onPress={signOut}>
          <Text className="text-secondary text-sm">Sign out</Text>
        </Pressable>
      </View>

      <Text className="text-on-surface-variant text-sm px-md pb-md">Source Feed</Text>

      {remixError ? <Text className="text-error text-sm px-md pb-sm">{remixError}</Text> : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#ddb7ff" />
        </View>
      ) : posts.length === 0 ? (
        <View className="flex-1 items-center justify-center px-md">
          <Text className="text-on-surface-variant text-center">
            No source posts yet. Connect a master source and let it poll.
          </Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <View className="bg-surface-container rounded-lg p-md mb-sm border border-outline-variant">
              <Text className="text-on-surface-variant text-xs mb-xs uppercase">{item.type}</Text>
              <Text className="text-on-surface text-sm mb-md" numberOfLines={4}>
                {item.text}
              </Text>
              <Pressable
                onPress={() => handleRemix(item)}
                disabled={remixing === item.id}
                className="bg-primary rounded-md px-md py-sm items-center self-start"
              >
                <Text className="text-on-primary text-sm font-semibold">
                  {remixing === item.id ? 'Generating…' : 'Remix'}
                </Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}
