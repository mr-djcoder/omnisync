import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { DraftVM } from './types';

export function useDrafts() {
  const [drafts, setDrafts] = useState<DraftVM[]>([]);
  const refresh = useCallback(async () => {
    // Published drafts move to History — don't list them here anymore.
    const { data } = await supabase
      .from('drafts')
      .select('id, source_post_id, origin, status')
      .neq('status', 'published')
      .order('created_at', { ascending: false });
    setDrafts((data as DraftVM[] | null) ?? []);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { drafts, refresh };
}

export async function generateForPost(
  sourcePostId: string,
): Promise<{ draftId?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('generate-variations', {
    body: { source_post_id: sourcePostId },
  });
  if (error) return { error: error.message };
  return { draftId: (data as { draft_id: string }).draft_id };
}
