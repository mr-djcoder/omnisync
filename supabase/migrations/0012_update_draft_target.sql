-- Update an existing draft target's text in place (Review edits). Without this
-- the app would re-insert via save_draft_target and duplicate targets.
create or replace function public.update_draft_target(p_id uuid, p_text text, p_enc_key text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select d.user_id into v_user
  from public.draft_targets t join public.drafts d on d.id = t.draft_id
  where t.id = p_id;
  if v_user is null then raise exception 'not authorized'; end if;
  if auth.uid() is not null and not (v_user = auth.uid()) then raise exception 'not authorized'; end if;
  update public.draft_targets set text_enc = pgp_sym_encrypt(p_text, p_enc_key) where id = p_id;
end; $$;
