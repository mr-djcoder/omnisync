// NOTE: The `postId` param actually carries the *draft id* (named for the file convention).
// Encryption is handled server-side via the draft-targets Edge Function.
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Image, ScrollView, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useConnections } from '../../../src/features/connections/useConnections';
import { providerLabel } from '../../../src/features/connections/connect';
import { useMediaPicker } from '../../../src/features/media/useMediaPicker';
import { charCount, mediaGuidelines } from '@omnisync/shared';
import { Screen, Button, Field, Card, Icon } from '../../../src/ui';
import type { DraftTargetVM } from '../../../src/features/drafts/types';

type ContentMode = 'shared' | 'per-target';

export default function ReviewCanvas() {
  const { postId: draftId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const { connections } = useConnections();
  const [targets, setTargets] = useState<DraftTargetVM[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contentMode, setContentMode] = useState<ContentMode>('shared');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [isRemix, setIsRemix] = useState(false);
  const [sourcePermalink, setSourcePermalink] = useState<string | null>(null);

  // Providers this draft publishes to (drives media rules). Falls back to the
  // only wired platform before connections resolve.
  function targetPlatforms(): string[] {
    const provs = targets
      .map((t) => connections.find((c) => c.id === t.connection_id)?.provider)
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    return provs.length > 0 ? Array.from(new Set<string>(provs)) : ['facebook'];
  }

  const { media, mediaError, pickMedia, captureMedia, removeMedia, uploadMedia } =
    useMediaPicker(targetPlatforms);

  useEffect(() => {
    if (!draftId) return;
    // Draft meta: is this a remix, and what's the source permalink (for the
    // link-share banner)?
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
        }
        setLoading(false);
      });
  }, [draftId]);

  // Persist each target's edited text (and any newly added media) before saving
  // or publishing. Media is shared across every target.
  async function persistEdits(): Promise<string | null> {
    let mediaUrls: string[] | null = null;
    if (media.length > 0) {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return 'Not authenticated.';
      try {
        mediaUrls = await uploadMedia(u.user.id, draftId!);
      } catch (e) {
        return e instanceof Error ? e.message : 'Media upload failed.';
      }
    }
    for (const t of targets) {
      const { error: upErr } = await supabase.functions.invoke('draft-targets', {
        body: {
          action: 'update',
          id: t.id,
          text: texts[t.id] ?? '',
          ...(mediaUrls ? { media: mediaUrls } : {}),
        },
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
    const results = (data?.results as Array<{ status: string; error?: string }> | undefined) ?? [];
    const failed = results.filter((r) => r.status !== 'success');
    if (failed.length > 0 && failed.length === results.length) {
      setError(failed[0]?.error ?? 'Publishing failed. Check the channel connection.');
      return;
    }
    router.push('/(app)/history');
  }

  // Display-only: resolve a friendly channel name from the connection id.
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

  if (error) {
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

        {/* Content mode toggle */}
        <View className="mb-lg flex-row rounded-full bg-surface-container p-xs">
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

        <Text className="text-on-surface-variant text-xs mb-md px-xs">
          {contentMode === 'shared'
            ? 'One message, mirrored to every channel.'
            : 'Tailor the copy for each channel individually.'}
        </Text>

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
                    numberOfLines={4}
                    style={{ textAlignVertical: 'top', minHeight: 96 }}
                    placeholder="Draft text…"
                    hint={`${charCount(value)} characters`}
                  />
                </Card>
              );
            })}
          </View>
        )}

        {/* Media — optional; shared across every channel. */}
        <View className="mt-lg gap-sm">
          <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-wide">
            Media (optional)
          </Text>
          {media.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-xs">
              {media.map((m) => (
                <View key={m.uri} className="mr-sm">
                  {m.kind === 'video' ? (
                    <View className="h-24 w-24 items-center justify-center rounded-2xl bg-surface-container-high">
                      <Icon name="play-circle" size={28} color="primary" />
                      <Text className="text-on-surface-variant text-[10px] mt-xs">Video</Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: m.uri }}
                      className="h-24 w-24 rounded-2xl"
                      resizeMode="cover"
                    />
                  )}
                  <Pressable
                    onPress={() => removeMedia(m.uri)}
                    className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60"
                  >
                    <Icon name="close" size={14} color="#ffffff" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View className="flex-row gap-sm">
            <Pressable
              onPress={pickMedia}
              className="flex-1 flex-row items-center justify-center gap-sm rounded-2xl border border-dashed border-outline-variant py-md active:opacity-80"
            >
              <Icon name="images-outline" size={18} color="primary" />
              <Text className="text-primary text-sm font-semibold">Gallery</Text>
            </Pressable>
            <Pressable
              onPress={captureMedia}
              className="flex-1 flex-row items-center justify-center gap-sm rounded-2xl border border-dashed border-outline-variant py-md active:opacity-80"
            >
              <Icon name="camera-outline" size={18} color="primary" />
              <Text className="text-primary text-sm font-semibold">Camera</Text>
            </Pressable>
          </View>
          {isRemix && media.length > 0 ? (
            <View className="flex-row items-start gap-xs rounded-xl bg-tertiary/10 px-sm py-xs">
              <Icon name="information-circle" size={14} color="tertiary" />
              <Text className="text-tertiary text-[11px] flex-1">
                Your media will show; the source link moves into your caption.
              </Text>
            </View>
          ) : (
            <Card variant="outlined" className="flex-row items-start gap-sm bg-tertiary/5">
              <Icon name="information-circle" size={16} color="tertiary" />
              <View className="flex-1 gap-xs">
                <Text className="text-on-surface text-xs font-semibold">Media guidelines</Text>
                {mediaGuidelines(targetPlatforms()).map((line) => (
                  <Text key={line} className="text-on-surface-variant text-[11px] leading-4">
                    • {line}
                  </Text>
                ))}
              </View>
            </Card>
          )}
          {mediaError ? (
            <View className="flex-row items-center gap-sm">
              <Icon name="alert-circle-outline" size={16} color="error" />
              <Text className="text-error text-sm flex-1">{mediaError}</Text>
            </View>
          ) : null}
        </View>

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
              label={publishing ? 'Publishing…' : 'Publish'}
              icon="send"
              onPress={handlePublish}
              loading={publishing}
            />
          </View>
        </View>
      </Screen>
    </View>
  );
}
