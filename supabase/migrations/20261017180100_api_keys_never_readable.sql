-- A stored key is never readable from a household session, on any of the
-- three key tables. Their "for all" admin policy (needed so an Admin can
-- upsert and delete by household_id) also matches SELECT, and the table-wide
-- SELECT grant let an Admin's session read `api_key` back through PostgREST.
-- Column privileges close that without touching the policies: every other
-- column stays selectable (so a WHERE on household_id still finds the row to
-- replace or remove), and `api_key` can be written but never read. The
-- server reads keys with the service role, which these grants do not touch.
revoke select on public.household_ai_credentials from authenticated, anon;
grant select (household_id, provider, set_by_member_id, created_at, updated_at) on public.household_ai_credentials to authenticated;

revoke select on public.household_voice_credentials from authenticated, anon;
grant select (household_id, provider, set_by_member_id, created_at, updated_at) on public.household_voice_credentials to authenticated;

revoke select on public.household_gemini_voice_credentials from authenticated, anon;
grant select (household_id, provider, set_by_member_id, created_at, updated_at) on public.household_gemini_voice_credentials to authenticated;

notify pgrst, 'reload schema';
