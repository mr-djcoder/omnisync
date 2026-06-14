create or replace function public.get_connection_token(p_connection_id uuid, p_enc_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc bytea;
begin
  select access_token_enc into v_enc from public.social_connections where id = p_connection_id;
  if v_enc is null then
    return null;
  end if;
  return pgp_sym_decrypt(v_enc, p_enc_key);
end;
$$;
revoke all on function public.get_connection_token(uuid, text) from anon, authenticated;
