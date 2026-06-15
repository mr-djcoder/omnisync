import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSourceFeed } from '../../src/features/drafts/useSourceFeed';
import { generateForPost } from '../../src/features/drafts/useDrafts';
import { syncNow } from '../../src/features/connections/connect';
import { supabase } from '../../src/lib/supabase';
import type { SourcePostVM } from '../../src/features/drafts/types';

// Auto-sync runs once per app session, not on every mount.
let didAutoSync = false;

export default function Home() {
  const { posts, loading, refresh } = useSourceFeed();
  const router = useRouter();
  const [remixing, setRemixing] = useState<string | null>(null);
  const [remixError, setRemixError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const masterConnectionId = useRef<string | null>(null);

  const runSync = useCallback(async () => {
    if (!masterConnectionId.current) return;
    setSyncing(true);
    setSyncError(null);
    setSyncNote(null);
    const { error, fetched, inserted } = await syncNow(masterConnectionId.current);
    if (error) {
      setSyncError(error);
    } else {
      await refresh();
      if (typeof inserted === 'number') {
        setSyncNote(
          inserted > 0
            ? `Synced ${inserted} new post${inserted === 1 ? '' : 's'}.`
            : `Up to date${typeof fetched === 'number' ? ` (${fetched} checked)` : ''}.`,
        );
      }
    }
    setSyncing(false);
  }, [refresh]);

  // Load the master source id, then auto-sync once on first app load.
  useEffect(() => {
    let active = true;
    supabase
      .from('master_source')
      .select('connection_id')
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        masterConnectionId.current = data?.connection_id ?? null;
        if (masterConnectionId.current && !didAutoSync) {
          didAutoSync = true;
          void runSync();
        }
      });
    return () => {
      active = false;
    };
  }, [runSync]);

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
        <Pressable
          onPress={runSync}
          disabled={syncing}
          className="bg-primary rounded-full px-md py-sm active:opacity-80"
        >
          {syncing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-on-primary text-sm font-semibold">Sync now</Text>
          )}
        </Pressable>
      </View>

      <Text className="text-on-surface-variant text-sm px-md pb-sm">Source Feed</Text>

      {syncError ? <Text className="text-error text-sm px-md pb-sm">{syncError}</Text> : null}
      {syncNote && !syncError ? (
        <Text className="text-on-surface-variant text-xs px-md pb-sm">{syncNote}</Text>
      ) : null}
      {remixError ? <Text className="text-error text-sm px-md pb-sm">{remixError}</Text> : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#ddb7ff" />
        </View>
      ) : posts.length === 0 ? (
        <View className="flex-1 items-center justify-center px-md">
          <Text className="text-on-surface-variant text-center">
            {syncing
              ? 'Syncing your master source…'
              : 'No source posts yet. Tap “Sync now” to pull the latest.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={syncing} onRefresh={runSync} tintColor="#ddb7ff" />
          }
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
