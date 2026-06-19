-- pgcrypto lives in the `extensions` schema on Supabase, but our SECURITY
-- DEFINER functions set search_path = public, so pgp_sym_encrypt/decrypt were
-- "not found" on the first real encrypted write (FB/IG connect via
-- upsert_connection; also the draft-text and token RPCs). Add `extensions` to
-- the search_path of every function that uses pgcrypto.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosrc ilike '%pgp_sym%'
  loop
    execute format('alter function %s set search_path = public, extensions', r.sig);
  end loop;
end $$;
