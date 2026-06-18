import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { SourcePostVM } from './types';

export function useSourceFeed() {
  const [posts, setPosts] = useState<SourcePostVM[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('source_posts')
      .select('id, type, text, media, posted_at')
      .order('created_at', { ascending: false })
      .limit(10);
    setPosts((data as SourcePostVM[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { posts, loading, refresh };
}
