import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { ConnectionVM } from './types';

export function useConnections() {
  const [connections, setConnections] = useState<ConnectionVM[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('social_connections_public')
      .select('id, provider, handle, status');
    setConnections((data as ConnectionVM[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { connections, loading, refresh };
}

export async function setMasterSource(connectionId: string): Promise<{ error?: string }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { error: 'unauthorized' };
  const { error } = await supabase
    .from('master_source')
    .upsert({ user_id: u.user.id, connection_id: connectionId }, { onConflict: 'user_id' });
  return error ? { error: error.message } : {};
}
