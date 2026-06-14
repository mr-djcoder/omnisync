import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export type PublicationVM = {
  id: string;
  status: string;
  external_post_id: string | null;
  published_at: string;
};

export function useHistory() {
  const [items, setItems] = useState<PublicationVM[]>([]);
  useEffect(() => {
    supabase
      .from('publications')
      .select('id, status, external_post_id, published_at')
      .order('published_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setItems((data as PublicationVM[] | null) ?? []));
  }, []);
  return { items };
}
