// Base URL for Supabase Edge Functions, derived from the project URL.
const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const FUNCTIONS_BASE = projectUrl.replace('.supabase.co', '.functions.supabase.co');

// Route external (e.g. Facebook CDN) media through our media-proxy so it
// renders despite hotlink blocks. Non-http(s) or empty inputs pass through.
export function proxiedMedia(url: string): string {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  return `${FUNCTIONS_BASE}/media-proxy?u=${encodeURIComponent(url)}`;
}
