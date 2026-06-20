import { useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Image, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase, ensureFreshSession } from '../../src/lib/supabase';
import { useConnections } from '../../src/features/connections/useConnections';
import { providerLabel } from '../../src/features/connections/connect';
import { useMediaPicker } from '../../src/features/media/useMediaPicker';
import { charCount, validateMedia, mediaGuidelines } from '@omnisync/shared';
import { Screen, Button, Field, Card, Icon } from '../../src/ui';

export default function Compose() {
  const router = useRouter();
  const { connections, loading: connsLoading } = useConnections();
  // Public-link (scrape) sources are monitor-only — never publish targets.
  const publishable = connections.filter((c) => c.connector_type !== 'scrape');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Providers we'll publish to (drives media rules). Falls back to the only
  // wired platform so picking is constrained even before targets are chosen.
  function targetPlatforms(): string[] {
    const picked = publishable.filter((c) => selectedIds.has(c.id)).map((c) => c.provider);
    return picked.length > 0 ? Array.from(new Set(picked)) : ['facebook'];
  }

  const { media, setMedia, mediaError, setMediaError, pickMedia, captureMedia, removeMedia, uploadMedia } =
    useMediaPicker(targetPlatforms);
  const hasVideo = media.some((m) => m.kind === 'video');

  // Start every New Broadcast with a clean screen.
  useFocusEffect(
    useCallback(() => {
      setText('');
      setSelectedIds(new Set());
      setError(null);
      setMedia([]);
      setMediaError(null);
    }, [setMedia, setMediaError]),
  );

  function toggleConnection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!text.trim() && media.length === 0) {
      setError('Add a message or some media.');
      return;
    }
    if (selectedIds.size === 0) {
      setError('Select at least one channel to publish to.');
      return;
    }
    const mediaErr = validateMedia(media, targetPlatforms());
    if (mediaErr) {
      setError(mediaErr);
      return;
    }
    setSaving(true);
    setError(null);
    await ensureFreshSession();

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setError('Not authenticated.');
      setSaving(false);
      return;
    }

    const { data: draft, error: draftErr } = await supabase
      .from('drafts')
      .insert({
        user_id: u.user.id,
        source_post_id: null,
        origin: 'original',
        content_mode: 'per-target',
        status: 'pending',
      })
      .select('id')
      .single();

    if (draftErr || !draft) {
      setError(draftErr?.message ?? 'Failed to create draft.');
      setSaving(false);
      return;
    }

    let mediaUrls: string[];
    try {
      mediaUrls = await uploadMedia(u.user.id, draft.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Media upload failed.');
      setSaving(false);
      return;
    }

    for (const connId of selectedIds) {
      const { error: targetErr } = await supabase.functions.invoke('draft-targets', {
        body: { action: 'save', draft_id: draft.id, connection_id: connId, text, media: mediaUrls },
      });
      if (targetErr) {
        setError(targetErr.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.push(`/(app)/review/${draft.id}`);
  }

  return (
    <Screen scroll>
      {/* Header */}
      <View className="flex-row items-center justify-between pt-md pb-lg">
        <View className="flex-row items-center gap-sm">
          <Pressable
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-container active:opacity-80"
          >
            <Icon name="arrow-back" size={20} color="on-surface" />
          </Pressable>
          <View>
            <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-widest">
              New Broadcast
            </Text>
            <Text className="text-on-surface text-3xl font-extrabold tracking-tight">Compose</Text>
          </View>
        </View>
      </View>

      {/* Shared message */}
      <View className="mb-md gap-sm">
        <View className="flex-row items-center justify-between">
          <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-wide">
            Your message
          </Text>
          <View className="flex-row items-center gap-xs rounded-full bg-surface-container-high px-sm py-xs">
            <Icon name="share-social-outline" size={12} color="on-surface-variant" />
            <Text className="text-on-surface-variant text-[11px] font-semibold">Shared</Text>
          </View>
        </View>
        <Field
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={6}
          className="min-h-[140px]"
          style={{ textAlignVertical: 'top', minHeight: 140 }}
          placeholder="What do you want to share across your channels?"
          hint={`${charCount(text)} characters`}
        />
      </View>

      {/* Media attachments */}
      <View className="mb-lg gap-sm">
        <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-wide">
          Media
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
            disabled={hasVideo}
            className={`flex-1 flex-row items-center justify-center gap-sm rounded-2xl border border-dashed border-outline-variant py-md ${
              hasVideo ? 'opacity-40' : 'active:opacity-80'
            }`}
          >
            <Icon name="images-outline" size={18} color="primary" />
            <Text className="text-primary text-sm font-semibold">Gallery</Text>
          </Pressable>
          <Pressable
            onPress={captureMedia}
            disabled={hasVideo}
            className={`flex-1 flex-row items-center justify-center gap-sm rounded-2xl border border-dashed border-outline-variant py-md ${
              hasVideo ? 'opacity-40' : 'active:opacity-80'
            }`}
          >
            <Icon name="camera-outline" size={18} color="primary" />
            <Text className="text-primary text-sm font-semibold">Camera</Text>
          </Pressable>
        </View>
        {hasVideo ? (
          <Text className="text-on-surface-variant text-[11px]">
            A video can’t be combined with photos — remove it to add other media.
          </Text>
        ) : null}
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
      </View>

      {/* Target channels — publishable accounts only (no public pages) */}
      <View className="mb-lg gap-sm">
        <View className="flex-row items-center justify-between">
          <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-wide">
            Publish to
          </Text>
          {selectedIds.size > 0 ? (
            <Text className="text-primary text-xs font-semibold">{selectedIds.size} selected</Text>
          ) : null}
        </View>

        {connsLoading ? (
          <Card variant="outlined" className="items-center py-lg">
            <ActivityIndicator />
          </Card>
        ) : publishable.length === 0 ? (
          <Card variant="outlined" className="items-center gap-sm py-lg">
            <Icon name="link-outline" size={24} color="on-surface-variant" />
            <Text className="text-on-surface-variant text-sm text-center px-md">
              No publishable accounts. Connect a Facebook account in Connect (public pages are
              monitor-only).
            </Text>
          </Card>
        ) : (
          publishable.map((conn) => {
            const selected = selectedIds.has(conn.id);
            return (
              <Card
                key={conn.id}
                onPress={() => toggleConnection(conn.id)}
                variant="outlined"
                className={`flex-row items-center gap-md ${selected ? 'border-primary' : ''}`}
              >
                <View
                  className={`h-10 w-10 items-center justify-center rounded-full ${
                    selected ? 'bg-primary' : 'bg-surface-container-high'
                  }`}
                >
                  <Icon
                    name="megaphone-outline"
                    size={18}
                    color={selected ? 'on-primary' : 'on-surface-variant'}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-on-surface text-sm font-semibold">
                    {providerLabel(conn.provider)}
                  </Text>
                  {conn.handle ? (
                    <Text className="text-on-surface-variant text-xs">{conn.handle}</Text>
                  ) : null}
                </View>
                <View
                  className={`h-6 w-6 items-center justify-center rounded-full border ${
                    selected ? 'border-primary bg-primary' : 'border-outline-variant'
                  }`}
                >
                  {selected ? <Icon name="checkmark" size={14} color="on-primary" /> : null}
                </View>
              </Card>
            );
          })
        )}
      </View>

      {error || mediaError ? (
        <View className="mb-md flex-row items-center gap-sm">
          <Icon name="alert-circle-outline" size={16} color="error" />
          <Text className="text-error text-sm flex-1">{error ?? mediaError}</Text>
        </View>
      ) : null}

      <View className="flex-row gap-sm">
        <View className="flex-1">
          <Button label="Cancel" icon="close" variant="outline" onPress={() => router.back()} />
        </View>
        <View className="flex-1">
          <Button
            label={saving ? 'Creating…' : 'Create & Review'}
            icon="send"
            onPress={handleSave}
            loading={saving}
            disabled={publishable.length === 0}
          />
        </View>
      </View>
    </Screen>
  );
}
