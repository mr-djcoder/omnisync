create or replace function public.upsert_connection(
  p_user_id uuid,
  p_provider text,
  p_external_id text,
  p_handle text,
  p_scopes text[],
  p_token text,
  p_enc_key text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.social_connections
    (user_id, provider, external_id, handle, scopes, access_token_enc, status)
  values
    (p_user_id, p_provider, p_external_id, p_handle, p_scopes,
     pgp_sym_encrypt(p_token, p_enc_key), 'active')
  on conflict (user_id, provider, external_id) do update
    set handle = excluded.handle,
        scopes = excluded.scopes,
        access_token_enc = excluded.access_token_enc,
        status = 'active';
end;
$$;

-- pgcrypto provides pgp_sym_encrypt.
create extension if not exists pgcrypto;
