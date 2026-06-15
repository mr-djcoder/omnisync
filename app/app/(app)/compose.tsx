import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useConnections } from '../../src/features/connections/useConnections';
import { providerLabel } from '../../src/features/connections/connect';
import { charCount } from '@omnisync/shared';
import { Screen, Button, Field, Card, Icon } from '../../src/ui';

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

      {/* Intro banner */}
      <Card variant="outlined" className="mb-lg flex-row items-center gap-md">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-container">
          <Icon name="create-outline" size={20} color="on-primary-container" />
        </View>
        <View className="flex-1">
          <Text className="text-on-surface text-sm font-semibold">Written from scratch</Text>
          <Text className="text-on-surface-variant text-xs">
            Broadcasts to every channel you select below.
          </Text>
        </View>
      </Card>

      {/* Shared message */}
      <View className="mb-lg gap-sm">
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

      {/* Target channels */}
      <View className="mb-lg gap-sm">
        <View className="flex-row items-center justify-between">
          <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-wide">
            Target channels
          </Text>
          {selectedIds.size > 0 ? (
            <Text className="text-primary text-xs font-semibold">{selectedIds.size} selected</Text>
          ) : null}
        </View>

        {connsLoading ? (
          <Card variant="outlined" className="items-center py-lg">
            <ActivityIndicator />
          </Card>
        ) : connections.length === 0 ? (
          <Card variant="outlined" className="items-center gap-sm py-lg">
            <Icon name="link-outline" size={24} color="on-surface-variant" />
            <Text className="text-on-surface-variant text-sm">No connected accounts.</Text>
          </Card>
        ) : (
          connections.map((conn) => {
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
      />
    </Screen>
  );
}
