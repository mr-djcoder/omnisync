import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSourceFeed } from '../../src/features/drafts/useSourceFeed';
import { generateForPost } from '../../src/features/drafts/useDrafts';
import { syncNow } from '../../src/features/connections/connect';
import { supabase } from '../../src/lib/supabase';
import { useTheme } from '../../theme/useTheme';
import { Button, Icon } from '../../src/ui';
import type { IconName } from '../../src/ui';
import type { SourcePostVM } from '../../src/features/drafts/types';

// Auto-sync runs once per app session, not on every mount.
let didAutoSync = false;

const TYPE_META: Record<string, { icon: IconName; label: string }> = {
  video: { icon: 'videocam', label: 'Video' },
  image: { icon: 'image', label: 'Image' },
  text: { icon: 'text', label: 'Text' },
};

// Source thumbnails come from external CDNs that may block hotlinking; hide the
// image (rather than leaving a blank box) if it fails to load.
function SourceThumb({ uri }: { uri: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Image
      source={{ uri }}
      className="w-full h-44"
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

export default function Home() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
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
            : `You're up to date${typeof fetched === 'number' ? ` · ${fetched} checked` : ''}.`,
        );
      }
    }
    setSyncing(false);
  }, [refresh]);

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
      setRemixError(error ?? 'Something went wrong. Try again.');
      return;
    }
    router.push(`/(app)/review/${draftId}`);
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-md pt-md pb-sm flex-row items-end justify-between">
        <View>
          <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-widest">
            Master Source
          </Text>
          <Text className="text-on-surface text-3xl font-extrabold tracking-tight">OmniSync</Text>
        </View>
        <Pressable
          onPress={runSync}
          disabled={syncing}
          className={`h-11 flex-row items-center gap-sm rounded-full bg-primary px-md ${
            syncing ? 'opacity-60' : 'active:opacity-80'
          }`}
        >
          {syncing ? (
            <ActivityIndicator size="small" color={colors['on-primary']} />
          ) : (
            <Icon name="sync" size={16} color="on-primary" />
          )}
          <Text className="text-on-primary text-sm font-semibold">
            {syncing ? 'Syncing' : 'Sync now'}
          </Text>
        </Pressable>
      </View>

      {(syncNote && !syncError) || syncError || remixError ? (
        <View className="px-md pb-sm">
          {syncError ? (
            <Text className="text-error text-xs">{syncError}</Text>
          ) : syncNote ? (
            <Text className="text-on-surface-variant text-xs">{syncNote}</Text>
          ) : null}
          {remixError ? <Text className="text-error text-xs mt-xs">{remixError}</Text> : null}
        </View>
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : posts.length === 0 ? (
        <View className="flex-1 items-center justify-center px-xl gap-md">
          <View className="h-20 w-20 items-center justify-center rounded-3xl bg-surface-container">
            <Icon name={syncing ? 'sync' : 'sparkles-outline'} size={32} color="primary" />
          </View>
          <Text className="text-on-surface text-lg font-bold text-center">
            {syncing ? 'Syncing your source…' : 'Your feed is empty'}
          </Text>
          <Text className="text-on-surface-variant text-center text-sm">
            {syncing
              ? 'Pulling the latest posts from your master source.'
              : 'Tap “Sync now” to pull the latest posts and remix them for every channel.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 24,
            gap: 12,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={syncing} onRefresh={runSync} tintColor={colors.primary} />
          }
          renderItem={({ item }) => {
            const meta = TYPE_META[item.type] ?? TYPE_META.text;
            const thumb = item.media?.[0];
            return (
              <View className="rounded-3xl bg-surface-container overflow-hidden border border-outline-variant">
                {thumb ? <SourceThumb uri={thumb} /> : null}
                <View className="p-md gap-sm">
                  <View className="flex-row items-center gap-xs">
                    <View className="flex-row items-center gap-xs rounded-full bg-surface-container-high px-sm py-xs">
                      <Icon name={meta.icon} size={12} color="on-surface-variant" />
                      <Text className="text-on-surface-variant text-[11px] font-semibold uppercase tracking-wide">
                        {meta.label}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-on-surface text-[15px] leading-5" numberOfLines={4}>
                    {item.text}
                  </Text>
                  <Button
                    label={remixing === item.id ? 'Generating…' : 'Remix for all channels'}
                    icon="color-wand"
                    onPress={() => handleRemix(item)}
                    loading={remixing === item.id}
                    size="md"
                    fullWidth={false}
                  />
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
