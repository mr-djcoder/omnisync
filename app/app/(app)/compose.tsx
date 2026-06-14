import { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useConnections } from '../../src/features/connections/useConnections';
import { providerLabel } from '../../src/features/connections/connect';
import { charCount } from '@omnisync/shared';

export default function Compose() {
  const router = useRouter();
  const { connections, loading: connsLoading } = useConnections();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
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

  async function handleSave() {
    if (!text.trim()) {
      setError('Please enter some text.');
      return;
    }
    if (selectedIds.size === 0) {
      setError('Select at least one target account.');
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

    for (const connId of selectedIds) {
      const { error: targetErr } = await supabase.functions.invoke('draft-targets', {
        body: {
          action: 'save',
          draft_id: draft.id,
          connection_id: connId,
          text,
          media: [],
        },
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
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16 }}>
      <View className="flex-row items-center justify-between mb-md">
        <Pressable onPress={() => router.back()}>
          <Text className="text-secondary text-sm">← Back</Text>
        </Pressable>
        <Text className="text-primary font-bold text-lg">Compose</Text>
        <View style={{ width: 60 }} />
      </View>

      <Text className="text-on-surface-variant text-sm mb-xs">Your post</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        className="text-on-surface bg-surface-container border border-outline-variant rounded-lg p-md min-h-[120px] mb-xs"
        style={{ textAlignVertical: 'top' }}
        placeholderTextColor="#988d9f"
        placeholder="Write your post…"
      />
      <Text className="text-on-surface-variant text-xs mb-md text-right">
        {charCount(text)} chars
      </Text>

      <Text className="text-on-surface-variant text-sm mb-sm">Target accounts</Text>
      {connsLoading ? (
        <ActivityIndicator color="#ddb7ff" />
      ) : connections.length === 0 ? (
        <Text className="text-on-surface-variant text-sm">No connected accounts.</Text>
      ) : (
        connections.map((conn) => (
          <Pressable
            key={conn.id}
            onPress={() => toggleConnection(conn.id)}
            className="flex-row items-center mb-sm bg-surface-container border border-outline-variant rounded-lg px-md py-sm"
          >
            <View
              className="w-5 h-5 rounded border border-outline-variant mr-sm items-center justify-center"
              style={{
                backgroundColor: selectedIds.has(conn.id) ? '#b76dff' : 'transparent',
              }}
            >
              {selectedIds.has(conn.id) ? (
                <Text className="text-on-primary text-xs font-bold">✓</Text>
              ) : null}
            </View>
            <Text className="text-on-surface text-sm flex-1">
              {providerLabel(conn.provider)}
              {conn.handle ? ` • ${conn.handle}` : ''}
            </Text>
          </Pressable>
        ))
      )}

      {error ? <Text className="text-error text-sm mt-sm mb-sm">{error}</Text> : null}

      <Pressable
        onPress={handleSave}
        disabled={saving}
        className="bg-primary rounded-lg py-sm items-center mt-md"
      >
        <Text className="text-on-primary font-semibold">{saving ? 'Saving…' : 'Save Draft'}</Text>
      </Pressable>
    </ScrollView>
  );
}
