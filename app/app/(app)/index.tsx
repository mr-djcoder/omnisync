import { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/features/auth/useAuth';
import { useSourceFeed } from '../../src/features/drafts/useSourceFeed';
import { generateForPost } from '../../src/features/drafts/useDrafts';
import { syncNow, setSyncMode } from '../../src/features/connections/connect';
import { supabase } from '../../src/lib/supabase';
import type { SourcePostVM } from '../../src/features/drafts/types';

export default function Home() {
  const { signOut } = useAuth();
  const { posts, loading } = useSourceFeed();
  const router = useRouter();
  const [remixing, setRemixing] = useState<string | null>(null);
  const [remixError, setRemixError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [masterConnectionId, setMasterConnectionId] = useState<string | null>(null);
  const [syncMode, setSyncModeState] = useState<'manual' | 'auto'>('manual');

  const loadMasterSource = useCallback(async () => {
    const { data } = await supabase.from('master_source').select('connection_id').maybeSingle();
    if (data?.connection_id) {
      setMasterConnectionId(data.connection_id);
      // Fetch the sync_mode for this connection
      const { data: conn } = await supabase
        .from('social_connections_public')
        .select('sync_mode')
        .eq('id', data.connection_id)
        .maybeSingle();
      if (conn?.sync_mode) {
        setSyncModeState(conn.sync_mode as 'manual' | 'auto');
      }
    }
  }, []);

  useEffect(() => {
    loadMasterSource();
  }, [loadMasterSource]);

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

  async function handleSyncNow() {
    if (!masterConnectionId) return;
    setSyncing(true);
    setSyncError(null);
    const { error } = await syncNow(masterConnectionId);
    setSyncing(false);
    if (error) {
      setSyncError(error);
    }
  }

  async function handleToggleSyncMode() {
    if (!masterConnectionId) return;
    const next = syncMode === 'manual' ? 'auto' : 'manual';
    setSyncModeState(next);
    await setSyncMode(masterConnectionId, next);
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

      {masterConnectionId ? (
        <View className="px-md pb-md flex-row items-center gap-sm">
          <Pressable
            onPress={handleSyncNow}
            disabled={syncing}
            className="bg-primary rounded-full px-md py-sm active:opacity-80"
          >
            {syncing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-on-primary text-sm font-semibold">Sync now</Text>
            )}
          </Pressable>
          <Pressable
            onPress={handleToggleSyncMode}
            className="border border-outline-variant rounded-full px-md py-sm active:opacity-80"
          >
            <Text className="text-on-surface text-sm">{syncMode === 'auto' ? 'Auto' : 'Manual'}</Text>
          </Pressable>
        </View>
      ) : null}

      {syncError ? <Text className="text-error text-sm px-md pb-sm">{syncError}</Text> : null}
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
