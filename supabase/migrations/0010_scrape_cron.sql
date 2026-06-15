-- Daily scrape of auto sources (requires pg_cron + pg_net + service_role_key in Vault).
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
