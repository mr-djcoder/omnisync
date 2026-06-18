import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
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
import { useConnections } from '../../src/features/connections/useConnections';
import { supabase } from '../../src/lib/supabase';
import { proxiedMedia } from '../../src/lib/functionsUrl';
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

// One media tile. Source media lives on external CDNs that block hotlinking,
// so we route it through media-proxy; if it still fails, hide the tile.
function MediaItem({
  uri,
  isVideo,
  className,
}: {
  uri: string;
  isVideo: boolean;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <View className={`relative overflow-hidden bg-surface-container-high ${className}`}>
      <Image
        source={{ uri: proxiedMedia(uri) }}
        className="w-full h-full"
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
      {isVideo ? (
        <View className="absolute inset-0 items-center justify-center">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-black/50">
            <Icon name="play" size={24} color="#ffffff" />
          </View>
        </View>
      ) : null}
    </View>
  );
}

// Renders all of a post's media: one full-width tile, or a horizontal gallery.
function PostMedia({ media, type }: { media: string[]; type: string }) {
  const isVideo = type === 'video';
  if (!media || media.length === 0) return null;
  if (media.length === 1) {
    return <MediaItem uri={media[0]} isVideo={isVideo} className="w-full h-60" />;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {media.map((m, i) => (
        <MediaItem
          key={`${m}-${i}`}
          uri={m}
          isVideo={isVideo}
          className={`w-72 h-60 rounded-2xl ${i > 0 ? 'ml-xs' : ''}`}
        />
      ))}
    </ScrollView>
  );
}

export default function Home() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { posts, loading, refresh } = useSourceFeed();
  const { connections } = useConnections();
  const router = useRouter();
  // Public-link (scrape) sources are monitor-only. Remix needs at least one
  // publishable (owned) channel to broadcast to.
  const canRemix = connections.some((c) => c.connector_type !== 'scrape');
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
          ListHeaderComponent={
            !canRemix ? (
              <Pressable
                onPress={() => router.push('/(app)/connect')}
                className="flex-row items-center gap-sm rounded-2xl bg-tertiary/10 px-md py-sm mb-xs active:opacity-80"
              >
                <Icon name="information-circle" size={18} color="tertiary" />
                <Text className="text-tertiary text-xs flex-1">
                  Your source is a public page (monitor-only). Connect an account in Connect to
                  publish remixes.
                </Text>
                <Icon name="chevron-forward" size={16} color="tertiary" />
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => {
            const meta = TYPE_META[item.type] ?? TYPE_META.text;
            return (
              <View className="rounded-3xl bg-surface-container overflow-hidden border border-outline-variant">
                {item.media?.length ? <PostMedia media={item.media} type={item.type} /> : null}
                <View className="p-md gap-sm">
                  <View className="flex-row items-center gap-xs">
                    <View className="flex-row items-center gap-xs rounded-full bg-surface-container-high px-sm py-xs">
                      <Icon name={meta.icon} size={12} color="on-surface-variant" />
                      <Text className="text-on-surface-variant text-[11px] font-semibold uppercase tracking-wide">
                        {meta.label}
                      </Text>
                    </View>
                    {item.posted_at ? (
                      <View className="flex-row items-center gap-xs rounded-full bg-surface-container-high px-sm py-xs">
                        <Icon name="calendar-outline" size={12} color="on-surface-variant" />
                        <Text className="text-on-surface-variant text-[11px] font-semibold">
                          {new Date(item.posted_at).toLocaleDateString()}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="text-on-surface text-[15px] leading-6">{item.text}</Text>
                  {canRemix ? (
                    <Button
                      label={remixing === item.id ? 'Generating…' : 'Remix for all channels'}
                      icon="color-wand"
                      onPress={() => handleRemix(item)}
                      loading={remixing === item.id}
                      size="md"
                      fullWidth={false}
                    />
                  ) : (
                    <Button
                      label="Connect a channel to remix"
                      icon="link"
                      variant="outline"
                      onPress={() => router.push('/(app)/connect')}
                      size="md"
                      fullWidth={false}
                    />
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
