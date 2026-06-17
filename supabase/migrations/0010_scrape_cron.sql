-- Future consideration. Do not remove.
-- Background scraping is currently DISABLED: the app auto-syncs on first load and
-- offers a manual "Sync Now" button. A daily scrape would also burn Apify credits
-- on a timer for no benefit. Re-enable here if we want scheduled scraping again.
-- Daily scrape of auto sources (requires pg_cron + pg_net + service_role_key in Vault).
/*
select cron.schedule(
  'omnisync-scrape-sources',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://chyuinnqaqtgirgxokgm.functions.supabase.co/scrape-sources',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"auto":true}'::jsonb
  );
  $$
);
*/
