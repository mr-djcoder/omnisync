-- Extend update_draft_target to also update media (Review can now attach the
-- user's own photos/video to a remix). p_media defaults to null so existing
-- text-only callers are unaffected; media is updated only when provided.
-- Drop the old 3-arg signature first so the new defaulted 4-arg overload does
-- not make 3-arg calls ambiguous ("function is not unique").
drop function if exists public.update_draft_target(uuid, text, text);
create or replace function public.update_draft_target(
  p_id uuid, p_text text, p_enc_key text, p_media jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select d.user_id into v_user
  from public.draft_targets t join public.drafts d on d.id = t.draft_id
  where t.id = p_id;
  if v_user is null then raise exception 'not authorized'; end if;
  if auth.uid() is not null and not (v_user = auth.uid()) then raise exception 'not authorized'; end if;
  update public.draft_targets
    set text_enc = pgp_sym_encrypt(p_text, p_enc_key),
        media = coalesce(p_media, media)
    where id = p_id;
end; $$;
