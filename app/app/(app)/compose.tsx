import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Image, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../src/lib/supabase';
import { useConnections } from '../../src/features/connections/useConnections';
import { providerLabel } from '../../src/features/connections/connect';
import { charCount } from '@omnisync/shared';
import { Screen, Button, Field, Card, Icon } from '../../src/ui';

export default function Compose() {
  const router = useRouter();
  const { connections, loading: connsLoading } = useConnections();
  // Public-link (scrape) sources are monitor-only — never publish targets.
  const publishable = connections.filter((c) => c.connector_type !== 'scrape');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [media, setMedia] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleConnection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function pickMedia() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
    });
    if (!result.canceled) {
      setMedia((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 4));
    }
  }

  function removeMedia(uri: string) {
    setMedia((prev) => prev.filter((m) => m !== uri));
  }

  // Upload local picks to the draft-media bucket; returns public URLs.
  async function uploadMedia(userId: string, draftId: string): Promise<string[]> {
    const urls: string[] = [];
    for (let i = 0; i < media.length; i++) {
      const uri = media[i];
      const ext = (uri.split('.').pop() ?? 'jpg').split('?')[0].toLowerCase();
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const res = await fetch(uri);
      const bytes = await res.arrayBuffer();
      const path = `${userId}/${draftId}/${i}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('draft-media')
        .upload(path, bytes, { contentType, upsert: true });
      if (upErr) throw new Error(`Media upload failed: ${upErr.message}`);
      urls.push(supabase.storage.from('draft-media').getPublicUrl(path).data.publicUrl);
    }
    return urls;
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
    setSaving(true);
    setError(null);

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
            {media.map((uri) => (
              <View key={uri} className="mr-sm">
                <Image source={{ uri }} className="h-24 w-24 rounded-2xl" resizeMode="cover" />
                <Pressable
                  onPress={() => removeMedia(uri)}
                  className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60"
                >
                  <Icon name="close" size={14} color="#ffffff" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}
        {media.length < 4 ? (
          <Pressable
            onPress={pickMedia}
            className="flex-row items-center justify-center gap-sm rounded-2xl border border-dashed border-outline-variant py-md active:opacity-80"
          >
            <Icon name="image-outline" size={18} color="primary" />
            <Text className="text-primary text-sm font-semibold">Add photos</Text>
          </Pressable>
        ) : null}
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

      {error ? (
        <View className="mb-md flex-row items-center gap-sm">
          <Icon name="alert-circle-outline" size={16} color="error" />
          <Text className="text-error text-sm flex-1">{error}</Text>
        </View>
      ) : null}

      <Button
        label={saving ? 'Creating…' : 'Create & Review'}
        icon="send"
        onPress={handleSave}
        loading={saving}
        disabled={publishable.length === 0}
      />
    </Screen>
  );
}
