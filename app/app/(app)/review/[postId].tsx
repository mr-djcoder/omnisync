// NOTE: The `postId` param actually carries the *draft id* (named for the file convention).
// Encryption is handled server-side via the draft-targets Edge Function.
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Image,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase, ensureFreshSession } from '../../../src/lib/supabase';
import { useConnections } from '../../../src/features/connections/useConnections';
import { providerLabel } from '../../../src/features/connections/connect';
import {
  useMediaPicker,
  pickMediaAssets,
  captureMediaAssets,
  uploadAssets,
} from '../../../src/features/media/useMediaPicker';
import {
  charCount,
  validateMedia,
  mediaGuidelines,
  isVideoUrl,
  type MediaAsset,
} from '@omnisync/shared';
import { Screen, Button, Field, Card, Icon } from '../../../src/ui';
import type { DraftTargetVM } from '../../../src/features/drafts/types';

type ContentMode = 'shared' | 'per-target';
type PublishResult = { connection_id: string; status: string; error?: string };

// Wrap an already-uploaded media URL as a MediaAsset so existing draft media can
// be shown in the picker and preserved on publish without re-uploading.
function assetFromUrl(url: string): MediaAsset {
  return { uri: url, kind: isVideoUrl(url) ? 'video' : 'image', remoteUrl: url };
}

// Two URL lists are equal when they hold the same URLs in the same order.
function sameUrls(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((u, i) => u === b[i]);
}

// Previews + Gallery/Camera buttons for one media set.
function MediaStrip({
  media,
  onPick,
  onCapture,
  onRemove,
}: {
  media: MediaAsset[];
  onPick: () => void;
  onCapture: () => void;
  onRemove: (uri: string) => void;
}) {
  const hasVideo = media.some((m) => m.kind === 'video');
  return (
    <View className="gap-sm">
      {media.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-xs">
          {media.map((m) => (
            <View key={m.uri} className="mr-sm">
              {m.kind === 'video' ? (
                <View className="h-20 w-20 items-center justify-center rounded-2xl bg-surface-container-high">
                  <Icon name="play-circle" size={24} color="primary" />
                  <Text className="text-on-surface-variant text-[10px] mt-xs">Video</Text>
                </View>
              ) : (
                <Image source={{ uri: m.uri }} className="h-20 w-20 rounded-2xl" resizeMode="cover" />
              )}
              <Pressable
                onPress={() => onRemove(m.uri)}
                className="absolute right-1 top-1 h-5 w-5 items-center justify-center rounded-full bg-black/60"
              >
                <Icon name="close" size={12} color="#ffffff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View className="flex-row gap-sm">
        <Pressable
          onPress={onPick}
          disabled={hasVideo}
          className={`flex-1 flex-row items-center justify-center gap-sm rounded-2xl border border-dashed border-outline-variant py-sm ${
            hasVideo ? 'opacity-40' : 'active:opacity-80'
          }`}
        >
          <Icon name="images-outline" size={16} color="primary" />
          <Text className="text-primary text-sm font-semibold">Gallery</Text>
        </Pressable>
        <Pressable
          onPress={onCapture}
          disabled={hasVideo}
          className={`flex-1 flex-row items-center justify-center gap-sm rounded-2xl border border-dashed border-outline-variant py-sm ${
            hasVideo ? 'opacity-40' : 'active:opacity-80'
          }`}
        >
          <Icon name="camera-outline" size={16} color="primary" />
          <Text className="text-primary text-sm font-semibold">Camera</Text>
        </Pressable>
      </View>
      {hasVideo ? (
        <Text className="text-on-surface-variant text-[11px]">
          A video can’t be combined with photos — remove it to add other media.
        </Text>
      ) : null}
    </View>
  );
}

export default function ReviewCanvas() {
  const { postId: draftId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const { connections } = useConnections();
  const [targets, setTargets] = useState<DraftTargetVM[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contentMode, setContentMode] = useState<ContentMode>('shared');
  const [showInfo, setShowInfo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [isRemix, setIsRemix] = useState(false);
  const [sourcePermalink, setSourcePermalink] = useState<string | null>(null);
  // Per-target media (per-target mode only). Shared mode uses the hook below.
  const [targetMedia, setTargetMedia] = useState<Record<string, MediaAsset[]>>({});
  // Per-channel publish outcomes — shown when some (not all) channels fail.
  const [publishResults, setPublishResults] = useState<PublishResult[] | null>(null);

  // Providers across all targets (drives shared-mode media rules). Falls back to
  // the only wired platform before connections resolve.
  function targetPlatforms(): string[] {
    const provs = targets
      .map((t) => connections.find((c) => c.id === t.connection_id)?.provider)
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    return provs.length > 0 ? Array.from(new Set<string>(provs)) : ['facebook'];
  }

  function targetProvider(connectionId: string): string {
    return connections.find((c) => c.id === connectionId)?.provider ?? 'facebook';
  }

  const shared = useMediaPicker(targetPlatforms);

  useEffect(() => {
    if (!draftId) return;
    // Draft meta: is this a remix, and what's the source permalink (link banner)?
    supabase
      .from('drafts')
      .select('origin, source_post_id')
      .eq('id', draftId)
      .maybeSingle()
      .then(async ({ data: d }) => {
        if (d?.origin === 'remix') {
          setIsRemix(true);
          if (d.source_post_id) {
            const { data: src } = await supabase
              .from('source_posts')
              .select('permalink')
              .eq('id', d.source_post_id)
              .maybeSingle();
            setSourcePermalink((src?.permalink as string | null) ?? null);
          }
        }
      });

    supabase.functions
      .invoke('draft-targets', { body: { action: 'list', draft_id: draftId } })
      .then(({ data, error: fnErr }) => {
        if (fnErr) {
          setError(fnErr.message);
        } else {
          const rows = (data?.targets as DraftTargetVM[] | null) ?? [];
          setTargets(rows);
          const init: Record<string, string> = {};
          for (const t of rows) init[t.id] = t.text;
          setTexts(init);

          // Seed media from existing draft targets so the picker reflects what's
          // already attached (e.g. from Compose) and publishing never silently
          // drops it. The visible picker is the source of truth on publish.
          const perTarget: Record<string, MediaAsset[]> = {};
          for (const t of rows) perTarget[t.id] = (t.media ?? []).map(assetFromUrl);
          setTargetMedia(perTarget);
          const mediaLists = rows.map((t) => t.media ?? []);
          const uniform =
            mediaLists.length > 0 && mediaLists.every((m) => sameUrls(m, mediaLists[0] ?? []));
          if (uniform && (mediaLists[0]?.length ?? 0) > 0) {
            shared.setMedia((mediaLists[0] ?? []).map(assetFromUrl));
          } else if (!uniform) {
            // Targets already diverge — start in per-target mode so nothing merges.
            setContentMode('per-target');
          }
        }
        setLoading(false);
      });
  }, [draftId]);

  // --- per-target media helpers ---
  function addTargetMedia(targetId: string, platform: string, assets: MediaAsset[]) {
    const next = [...(targetMedia[targetId] ?? []), ...assets];
    const err = validateMedia(next, [platform]);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setTargetMedia((prev) => ({ ...prev, [targetId]: next }));
  }
  async function pickForTarget(targetId: string, platform: string) {
    const assets = await pickMediaAssets([platform]);
    if (assets) addTargetMedia(targetId, platform, assets);
  }
  async function captureForTarget(targetId: string, platform: string) {
    const { assets, error: camErr } = await captureMediaAssets();
    if (camErr) {
      setError(camErr);
      return;
    }
    if (assets) addTargetMedia(targetId, platform, assets);
  }
  function removeForTarget(targetId: string, uri: string) {
    setTargetMedia((prev) => ({
      ...prev,
      [targetId]: (prev[targetId] ?? []).filter((m) => m.uri !== uri),
    }));
  }

  // Persist edited text (and any added media) before saving or publishing.
  async function persistEdits(): Promise<string | null> {
    if (!draftId) return 'Missing draft.';
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return 'Not authenticated.';
    const userId = u.user.id;

    // The active mode is authoritative: always write an explicit media list so
    // switching Shared <-> Per-target never leaves stale media on a target.
    let sharedUrls: string[] = [];
    const perTargetUrls: Record<string, string[]> = {};
    try {
      if (contentMode === 'shared') {
        sharedUrls = await uploadAssets(shared.media, `${userId}/${draftId}/shared`);
      } else {
        for (const t of targets) {
          perTargetUrls[t.id] = await uploadAssets(
            targetMedia[t.id] ?? [],
            `${userId}/${draftId}/${t.id}`,
          );
        }
      }
    } catch (e) {
      return e instanceof Error ? e.message : 'Media upload failed.';
    }

    for (const t of targets) {
      const mediaUrls = contentMode === 'shared' ? sharedUrls : (perTargetUrls[t.id] ?? []);
      const { error: upErr } = await supabase.functions.invoke('draft-targets', {
        body: { action: 'update', id: t.id, text: texts[t.id] ?? '', media: mediaUrls },
      });
      if (upErr) return upErr.message;
    }
    return null;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const err = await persistEdits();
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    router.push('/(app)/drafts');
  }

  async function handlePublish() {
    if (!draftId) return;
    setPublishing(true);
    setError(null);
    setPublishResults(null);
    await ensureFreshSession();
    const saveErr = await persistEdits();
    if (saveErr) {
      setPublishing(false);
      setError(saveErr);
      return;
    }
    const { data, error: pubErr } = await supabase.functions.invoke('publish', {
      body: { draft_id: draftId },
    });
    setPublishing(false);
    if (pubErr) {
      setError(pubErr.message);
      return;
    }
    const results = (data?.results as PublishResult[] | undefined) ?? [];
    // A skip (e.g. Instagram with no media) is not a failure. Only true failures
    // keep the user here; otherwise confirm success and move to History.
    const blocking = results.filter((r) => r.status !== 'success' && r.status !== 'skipped');
    if (blocking.length === 0) {
      const ok = results.filter((r) => r.status === 'success').length;
      const skipped = results.filter((r) => r.status === 'skipped').length;
      Alert.alert(
        'Published',
        `${ok} channel${ok === 1 ? '' : 's'} published${skipped ? `, ${skipped} skipped` : ''}.`,
        [{ text: 'OK', onPress: () => router.replace('/(app)/history') }],
      );
      return;
    }
    setPublishResults(results);
  }

  function channelLabel(connectionId: string): string {
    const conn = connections.find((c) => c.id === connectionId);
    if (!conn) return connectionId;
    return conn.handle
      ? `${providerLabel(conn.provider)} · ${conn.handle}`
      : providerLabel(conn.provider);
  }

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  if (error && targets.length === 0) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-xl gap-md">
        <View className="h-16 w-16 items-center justify-center rounded-3xl bg-surface-container">
          <Icon name="warning-outline" size={28} color="error" />
        </View>
        <Text className="text-on-surface text-center text-base font-semibold">{error}</Text>
        <Button label="Go back" icon="arrow-back" variant="tonal" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Screen scroll>
        {/* Header */}
        <View className="flex-row items-center gap-sm pt-md pb-lg">
          <Pressable
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-container active:opacity-80"
          >
            <Icon name="arrow-back" size={20} color="on-surface" />
          </Pressable>
          <View>
            <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-widest">
              Review &amp; Publish
            </Text>
            <Text className="text-on-surface text-3xl font-extrabold tracking-tight">
              Review Draft
            </Text>
          </View>
        </View>

        {/* Source banner — link share preserves the original post. */}
        {isRemix ? (
          <Card variant="filled" className="mb-lg bg-primary/5 border border-primary/20 gap-xs">
            <View className="flex-row items-center gap-sm">
              <Icon name="link" size={16} color="primary" />
              <Text className="text-on-surface text-sm font-bold flex-1">Sharing from source</Text>
            </View>
            <Text className="text-on-surface-variant text-xs">
              {sourcePermalink
                ? 'The original post link is included so credit stays with the source.'
                : 'No public link was captured for this source — it will post as text only.'}
            </Text>
            {sourcePermalink ? (
              <Pressable onPress={() => Linking.openURL(sourcePermalink)}>
                <Text className="text-primary text-xs font-semibold" numberOfLines={1}>
                  {sourcePermalink}
                </Text>
              </Pressable>
            ) : null}
          </Card>
        ) : null}

        {/* Content mode toggle + info icon */}
        <View className="flex-row items-center gap-sm mb-sm">
          <View className="flex-1 flex-row rounded-full bg-surface-container p-xs">
            {(['shared', 'per-target'] as ContentMode[]).map((mode) => {
              const active = contentMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setContentMode(mode)}
                  className={`flex-1 flex-row items-center justify-center gap-xs rounded-full py-sm ${
                    active ? 'bg-primary' : ''
                  }`}
                >
                  <Icon
                    name={mode === 'shared' ? 'share-social-outline' : 'options-outline'}
                    size={14}
                    color={active ? 'on-primary' : 'on-surface-variant'}
                  />
                  <Text
                    className={`text-sm font-semibold ${active ? 'text-on-primary' : 'text-on-surface-variant'}`}
                  >
                    {mode === 'shared' ? 'Shared' : 'Per-target'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => setShowInfo((v) => !v)}
            className={`h-10 w-10 items-center justify-center rounded-full ${
              showInfo ? 'bg-primary/15' : 'bg-surface-container'
            } active:opacity-80`}
            accessibilityLabel="How publishing works"
          >
            <Icon
              name={showInfo ? 'information-circle' : 'information-circle-outline'}
              size={20}
              color={showInfo ? 'primary' : 'on-surface-variant'}
            />
          </Pressable>
        </View>

        {/* Info card — only visible when the info icon is tapped. */}
        {showInfo ? (
          <Card variant="outlined" className="mb-lg gap-xs bg-tertiary/5">
            <Text className="text-on-surface text-xs font-bold">How publishing works</Text>
            <Text className="text-on-surface-variant text-[11px] leading-4">
              • Shared — one message and media set, mirrored to every channel.
            </Text>
            <Text className="text-on-surface-variant text-[11px] leading-4">
              • Per-target — tailor the text and media separately for each channel.
            </Text>
            {isRemix ? (
              <Text className="text-on-surface-variant text-[11px] leading-4">
                • A channel with no media posts the source as a link card; adding media makes it a
                native post with the source link in the caption.
              </Text>
            ) : null}
            {mediaGuidelines(targetPlatforms()).map((line) => (
              <Text key={line} className="text-on-surface-variant text-[11px] leading-4">
                • {line}
              </Text>
            ))}
          </Card>
        ) : null}

        {targets.length === 0 ? (
          <Card variant="outlined" className="items-center gap-sm py-xl">
            <Icon name="file-tray-outline" size={28} color="on-surface-variant" />
            <Text className="text-on-surface-variant text-center text-sm">
              No targets found for this draft.
            </Text>
          </Card>
        ) : (
          <View className="gap-md">
            {targets.map((target) => {
              const value = texts[target.id] ?? '';
              const provider = targetProvider(target.connection_id);
              return (
                <Card key={target.id} variant="outlined" className="gap-sm">
                  <View className="flex-row items-center gap-sm">
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-container-high">
                      <Icon name="megaphone-outline" size={16} color="on-surface-variant" />
                    </View>
                    <Text
                      className="text-on-surface text-sm font-semibold flex-1"
                      numberOfLines={1}
                    >
                      {channelLabel(target.connection_id)}
                    </Text>
                  </View>
                  <Field
                    value={value}
                    onChangeText={(val) => setTexts((prev) => ({ ...prev, [target.id]: val }))}
                    multiline
                    numberOfLines={10}
                    scrollEnabled
                    style={{ textAlignVertical: 'top', minHeight: 200, maxHeight: 320 }}
                    placeholder="Draft text…"
                    hint={`${charCount(value)} characters`}
                  />
                  {/* Per-target media lives inside each channel card. */}
                  {contentMode === 'per-target' ? (
                    <MediaStrip
                      media={targetMedia[target.id] ?? []}
                      onPick={() => pickForTarget(target.id, provider)}
                      onCapture={() => captureForTarget(target.id, provider)}
                      onRemove={(uri) => removeForTarget(target.id, uri)}
                    />
                  ) : null}
                </Card>
              );
            })}
          </View>
        )}

        {/* Shared media — one set mirrored to every channel. */}
        {contentMode === 'shared' ? (
          <View className="mt-lg gap-sm">
            <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-wide">
              Media (optional)
            </Text>
            <MediaStrip
              media={shared.media}
              onPick={shared.pickMedia}
              onCapture={shared.captureMedia}
              onRemove={shared.removeMedia}
            />
          </View>
        ) : null}

        {error ? (
          <View className="mt-md flex-row items-center gap-sm">
            <Icon name="alert-circle-outline" size={16} color="error" />
            <Text className="text-error text-sm flex-1">{error}</Text>
          </View>
        ) : null}
        {shared.mediaError && contentMode === 'shared' ? (
          <View className="mt-md flex-row items-center gap-sm">
            <Icon name="alert-circle-outline" size={16} color="error" />
            <Text className="text-error text-sm flex-1">{shared.mediaError}</Text>
          </View>
        ) : null}

        {/* Per-channel publish outcomes (success / failed / skipped). */}
        {publishResults ? (
          <Card variant="outlined" className="mt-lg gap-sm">
            <Text className="text-on-surface text-sm font-bold">
              {publishResults.some((r) => r.status !== 'success' && r.status !== 'skipped')
                ? publishResults.some((r) => r.status === 'success')
                  ? 'Published with some failures'
                  : 'Publishing failed'
                : publishResults.some((r) => r.status === 'skipped')
                  ? 'Published (some channels skipped)'
                  : 'Published'}
            </Text>
            {publishResults.map((r) => {
              const ok = r.status === 'success';
              const skipped = r.status === 'skipped';
              return (
                <View key={r.connection_id} className="flex-row items-start gap-sm">
                  <Icon
                    name={ok ? 'checkmark-circle' : skipped ? 'remove-circle' : 'close-circle'}
                    size={16}
                    color={ok ? 'primary' : skipped ? 'tertiary' : 'error'}
                  />
                  <View className="flex-1">
                    <Text className="text-on-surface text-xs font-semibold">
                      {channelLabel(r.connection_id)}
                    </Text>
                    {!ok ? (
                      <Text
                        className={`text-[11px] leading-4 ${skipped ? 'text-on-surface-variant' : 'text-error'}`}
                      >
                        {r.error ?? 'Failed. Check the channel connection.'}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {publishResults.some((r) => r.status === 'success') ? (
              <Text className="text-on-surface-variant text-[11px] mt-xs">
                Channels that posted are saved to History. Re-publishing would post to them again, so
                fix the failed channels separately.
              </Text>
            ) : null}
          </Card>
        ) : null}

        {/* If anything already succeeded (or nothing is left to retry), go to
            History instead of re-publishing (which would duplicate posts). */}
        {publishResults &&
        (publishResults.some((r) => r.status === 'success') ||
          !publishResults.some((r) => r.status !== 'success' && r.status !== 'skipped')) ? (
          <View className="mt-lg">
            <Button
              label="Go to History"
              icon="time-outline"
              onPress={() => router.push('/(app)/history')}
            />
          </View>
        ) : (
          <View className="flex-row gap-sm mt-lg">
            <View className="flex-1">
              <Button
                label={saving ? 'Saving…' : 'Save Draft'}
                icon="bookmark-outline"
                variant="outline"
                onPress={handleSave}
                loading={saving}
              />
            </View>
            <View className="flex-1">
              <Button
                label={publishing ? 'Publishing…' : publishResults ? 'Retry' : 'Publish'}
                icon="send"
                onPress={handlePublish}
                loading={publishing}
              />
            </View>
          </View>
        )}
      </Screen>
    </View>
  );
}
