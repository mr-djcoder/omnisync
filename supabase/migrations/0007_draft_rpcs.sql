-- Save (encrypt) a draft target's text for the owner.
create or replace function public.save_draft_target(
  p_draft_id uuid, p_connection_id uuid, p_text text, p_media jsonb, p_enc_key text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_user uuid;
begin
  select user_id into v_user from public.drafts where id = p_draft_id;
  if v_user is null or v_user <> auth.uid() then
    raise exception 'not authorized';
  end if;
  insert into public.draft_targets (draft_id, connection_id, text_enc, media)
  values (p_draft_id, p_connection_id, pgp_sym_encrypt(p_text, p_enc_key), coalesce(p_media, '[]'::jsonb))
  returning id into v_id;
  return v_id;
end; $$;

-- Read (decrypt) a draft's targets for the owner.
create or replace function public.get_draft_targets(p_draft_id uuid, p_enc_key text)
returns table (id uuid, connection_id uuid, text text, media jsonb)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.drafts d where d.id = p_draft_id and d.user_id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  return query
    select t.id, t.connection_id, pgp_sym_decrypt(t.text_enc, p_enc_key), t.media
    from public.draft_targets t where t.draft_id = p_draft_id;
end; $$;
