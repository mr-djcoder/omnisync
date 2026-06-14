// NOTE: The `postId` param actually carries the *draft id* (named for the file convention).
// Known limitation: enc key is read from EXPO_PUBLIC_DRAFT_ENC_KEY and passed by the client
// to get_draft_targets. Follow-up: move decryption fully server-side so the client never
// supplies the key.
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { charCount } from '@omnisync/shared';
import type { DraftTargetVM } from '../../../src/features/drafts/types';

type ContentMode = 'shared' | 'per-target';

export default function ReviewCanvas() {
  const { postId: draftId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const [targets, setTargets] = useState<DraftTargetVM[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contentMode, setContentMode] = useState<ContentMode>('shared');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!draftId) return;
    const encKey = process.env.EXPO_PUBLIC_DRAFT_ENC_KEY ?? '';
    supabase
      .rpc('get_draft_targets', { p_draft_id: draftId, p_enc_key: encKey })
      .then(({ data, error: rpcErr }) => {
        if (rpcErr) {
          setError(rpcErr.message);
        } else {
          const rows = (data as DraftTargetVM[] | null) ?? [];
          setTargets(rows);
          const init: Record<string, string> = {};
          for (const t of rows) init[t.id] = t.text;
          setTexts(init);
        }
        setLoading(false);
      });
  }, [draftId]);

  async function handleSave() {
    setSaving(true);
    router.push('/(app)/drafts');
    setSaving(false);
  }

  async function handlePublish() {
    if (!draftId) return;
    setPublishing(true);
    await supabase.from('drafts').update({ status: 'published' }).eq('id', draftId);
    setPublishing(false);
    router.push('/(app)/drafts');
  }

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#ddb7ff" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-md">
        <Text className="text-error text-center">{error}</Text>
        <Pressable onPress={() => router.back()} className="mt-md">
          <Text className="text-secondary">Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16 }}>
      <View className="flex-row items-center justify-between mb-md">
        <Pressable onPress={() => router.back()}>
          <Text className="text-secondary text-sm">← Back</Text>
        </Pressable>
        <Text className="text-primary font-bold text-lg">Review Draft</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Content mode toggle */}
      <View className="flex-row mb-md bg-surface-container rounded-lg overflow-hidden border border-outline-variant">
        {(['shared', 'per-target'] as ContentMode[]).map((mode) => (
          <Pressable
            key={mode}
            onPress={() => setContentMode(mode)}
            className="flex-1 py-sm items-center"
            style={{ backgroundColor: contentMode === mode ? '#b76dff' : 'transparent' }}
          >
            <Text
              className="text-sm font-semibold"
              style={{ color: contentMode === mode ? '#490080' : '#cfc2d6' }}
            >
              {mode === 'shared' ? 'Shared' : 'Per-target'}
            </Text>
          </Pressable>
        ))}
      </View>

      {targets.length === 0 ? (
        <View className="flex-1 items-center justify-center py-xl">
          <Text className="text-on-surface-variant text-center">
            No targets found for this draft.
          </Text>
        </View>
      ) : (
        targets.map((target) => (
          <View
            key={target.id}
            className="bg-surface-container rounded-lg p-md mb-sm border border-outline-variant"
          >
            <Text className="text-on-surface-variant text-xs mb-xs uppercase">
              {target.connection_id}
            </Text>
            <TextInput
              value={texts[target.id] ?? ''}
              onChangeText={(val) => setTexts((prev) => ({ ...prev, [target.id]: val }))}
              multiline
              className="text-on-surface text-sm min-h-[80px] bg-surface-container-lowest rounded p-sm border border-outline-variant"
              style={{ textAlignVertical: 'top' }}
              placeholderTextColor="#988d9f"
              placeholder="Draft text…"
            />
            <Text className="text-on-surface-variant text-xs mt-xs text-right">
              {charCount(texts[target.id] ?? '')} chars
            </Text>
          </View>
        ))
      )}

      <View className="flex-row gap-sm mt-md">
        <Pressable
          onPress={handleSave}
          disabled={saving}
          className="flex-1 bg-surface-container border border-outline-variant rounded-lg py-sm items-center"
        >
          <Text className="text-on-surface font-semibold">{saving ? 'Saving…' : 'Save Draft'}</Text>
        </Pressable>
        <Pressable
          onPress={handlePublish}
          disabled={publishing}
          className="flex-1 bg-primary rounded-lg py-sm items-center"
        >
          <Text className="text-on-primary font-semibold">
            {publishing ? 'Publishing…' : 'Publish'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
