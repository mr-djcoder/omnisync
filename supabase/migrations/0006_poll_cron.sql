-- Requires pg_cron + pg_net (enable in Supabase dashboard → Database → Extensions).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Invoke the poll-sources Edge Function every 5 minutes.
-- Replace <PROJECT_REF> and set the service-role key via a Vault secret in production;
-- this migration documents the schedule shape.
select cron.schedule(
  'omnisync-poll-sources',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/poll-sources',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
