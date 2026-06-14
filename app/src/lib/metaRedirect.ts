// Facebook rejects custom-scheme redirect URIs, so FB OAuth redirects to this https
// Edge Function, which forwards to the app's omnisync:// scheme with the code.
export const META_REDIRECT_URI =
  'https://chyuinnqaqtgirgxokgm.functions.supabase.co/oauth-redirect';
