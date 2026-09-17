-- PostgREST entry point for household creation (story 01-001).
--
-- Applied to the wonder-home Supabase project as version 20260917005904.
--
-- The `wh` schema is deliberately not exposed over the API — it holds SECURITY
-- DEFINER helpers that RLS policies depend on, and none of them should be
-- callable from a browser. Household creation does need to be callable, so it
-- gets a thin SECURITY INVOKER wrapper in `public`: the privilege escalation
-- and every invariant stay inside wh.create_household(), and this wrapper adds
-- nothing but reachability.

create or replace function public.create_household(
  p_household_name text,
  p_display_name text,
  p_timezone text default 'Asia/Kolkata'
)
returns table (household_id uuid, member_id uuid)
language sql
security invoker
set search_path = ''
as $$
  select household_id, member_id
  from wh.create_household(p_household_name, p_display_name, p_timezone);
$$;

comment on function public.create_household(text, text, text) is
  'PostgREST entry point for wh.create_household(). The wh schema is not exposed over the API, so domain callers reach it through this thin wrapper; the privilege escalation and the invariants stay in the wh function.';

revoke execute on function public.create_household(text, text, text) from public, anon;
grant execute on function public.create_household(text, text, text) to authenticated;

notify pgrst, 'reload schema';
