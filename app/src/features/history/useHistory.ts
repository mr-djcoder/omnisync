import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export type PublicationVM = {
  id: string;
  status: string;
  text: string | null;
  provider: string | null;
  handle: string | null;
  published_at: string;
};

export function useHistory() {
  const [items, setItems] = useState<PublicationVM[]>([]);
  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('publications')
      .select('id, status, text, provider, handle, published_at')
      .order('published_at', { ascending: false })
      .limit(20);
    setItems((data as PublicationVM[] | null) ?? []);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { items, refresh };
}
