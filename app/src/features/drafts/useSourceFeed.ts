import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { SourcePostVM } from './types';

export function useSourceFeed() {
  const [posts, setPosts] = useState<SourcePostVM[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase
      .from('source_posts')
      .select('id, type, text, media')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setPosts((data as SourcePostVM[] | null) ?? []);
        setLoading(false);
      });
  }, []);
  return { posts, loading };
}
