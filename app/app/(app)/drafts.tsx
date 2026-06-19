import { useCallback } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDrafts } from '../../src/features/drafts/useDrafts';
import { Icon } from '../../src/ui';
import type { IconName } from '../../src/ui';
import type { DraftVM } from '../../src/features/drafts/types';

type StatusMeta = { label: string; icon: IconName; chip: string; text: string };

const STATUS_META: Record<string, StatusMeta> = {
  pending: {
    label: 'Pending',
    icon: 'ellipse-outline',
    chip: 'bg-surface-container-high',
    text: 'text-on-surface-variant',
  },
  edited: {
    label: 'Edited',
    icon: 'create-outline',
    chip: 'bg-primary-container',
    text: 'text-on-primary-container',
  },
  published: {
    label: 'Published',
    icon: 'checkmark-circle',
    chip: 'bg-secondary-container',
    text: 'text-on-secondary-container',
  },
};

function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? STATUS_META.pending;
}

export default function DraftsList() {
  const { drafts, refresh } = useDrafts();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Refresh on focus so a just-published draft drops off the list.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-md pt-md pb-sm flex-row items-end justify-between">
        <View>
          <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-widest">
            Workspace
          </Text>
          <Text className="text-on-surface text-3xl font-extrabold tracking-tight">Drafts</Text>
        </View>
        {/* Create action: new broadcast to all channels (not tied to a source post) */}
        <Pressable
          onPress={() => router.push('/(app)/compose')}
          className="h-11 flex-row items-center gap-sm rounded-full bg-primary px-md active:opacity-80"
        >
          <Icon name="add" size={18} color="on-primary" />
          <Text className="text-on-primary text-sm font-semibold">New broadcast</Text>
        </Pressable>
      </View>

      {drafts.length === 0 ? (
        <View className="flex-1 items-center justify-center px-xl gap-md">
          <View className="h-20 w-20 items-center justify-center rounded-3xl bg-surface-container">
            <Icon name="documents-outline" size={32} color="primary" />
          </View>
          <Text className="text-on-surface text-lg font-bold text-center">No drafts yet</Text>
          <Text className="text-on-surface-variant text-center text-sm">
            Remix a source post or tap “New broadcast” to compose a post for every channel.
          </Text>
        </View>
      ) : (
        <FlatList
          data={drafts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 24,
            gap: 12,
          }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: DraftVM }) => {
            const meta = statusMeta(item.status);
            return (
              <Pressable
                onPress={() => router.push(`/(app)/review/${item.id}`)}
                className="rounded-3xl bg-surface-container overflow-hidden border border-outline-variant active:opacity-80"
              >
                <View className="p-md gap-sm">
                  <View className="flex-row items-center justify-between">
                    <View
                      className={`flex-row items-center gap-xs rounded-full px-sm py-xs ${meta.chip}`}
                    >
                      <Icon name={meta.icon} size={12} color={meta.text.replace('text-', '')} />
                      <Text
                        className={`text-[11px] font-semibold uppercase tracking-wide ${meta.text}`}
                      >
                        {meta.label}
                      </Text>
                    </View>
                    <Icon name="chevron-forward" size={18} color="on-surface-variant" />
                  </View>

                  <Text className="text-on-surface text-[15px] font-bold capitalize">
                    {item.origin}
                  </Text>

                  <View className="flex-row items-center gap-xs">
                    <Icon
                      name={item.source_post_id ? 'git-branch-outline' : 'megaphone-outline'}
                      size={14}
                      color="on-surface-variant"
                    />
                    <Text className="text-on-surface-variant text-xs flex-1" numberOfLines={1}>
                      {item.source_post_id
                        ? `Source: ${item.source_post_id}`
                        : 'Broadcast to all channels'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
