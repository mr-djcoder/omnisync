import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

// Onboarded = the user has a master source row.
// `routeKey` lets callers force a re-check (e.g. the navigation group changing
// after the user creates their master source). While a re-check is in flight we
// return null so the routing guard waits instead of redirecting on a stale value.
export function useOnboarded(sessionUserId: string | null, routeKey?: string) {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    if (!sessionUserId) {
      setOnboarded(null);
      return;
    }
    setOnboarded(null);
    supabase
      .from('master_source')
      .select('user_id')
      .maybeSingle()
      .then(({ data, error }) => {
        if (active) {
          // On error, treat as NOT onboarded so routing lands in onboarding.
          setOnboarded(error ? false : !!data);
        }
      });
    return () => {
      active = false;
    };
  }, [sessionUserId, routeKey]);

  return onboarded;
}
