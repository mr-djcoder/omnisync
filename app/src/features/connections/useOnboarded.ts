import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

// Onboarded = the user has a master source row.
export function useOnboarded(sessionUserId: string | null) {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    if (!sessionUserId) {
      setOnboarded(null);
      return;
    }
    supabase
      .from('master_source')
      .select('user_id')
      .maybeSingle()
      .then(({ data }) => {
        if (active) setOnboarded(!!data);
      });
    return () => {
      active = false;
    };
  }, [sessionUserId]);

  return onboarded;
}
