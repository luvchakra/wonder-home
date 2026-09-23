-- Expose only the narrow autonomy lookup needed by the agent runtime.
--
-- The canonical function remains in the private `wh` schema. PostgREST does
-- not expose that schema, so callers using supabase.rpc("autonomy_for", ...)
-- previously received PGRST202 and the runtime safely fell back to observe.
-- This wrapper keeps `wh` private while enforcing household membership at the
-- API boundary. The underlying function remains the security-definer domain
-- primitive that reads the household's configured policy.

create or replace function public.autonomy_for(
  p_household_id uuid,
  p_outcome_key text
)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not wh.is_member(p_household_id) then
    raise exception 'household access denied';
  end if;

  return wh.autonomy_for(p_household_id, p_outcome_key);
end;
$$;

comment on function public.autonomy_for(uuid, text) is
  'Narrow authenticated API wrapper for wh.autonomy_for(). Requires active membership in the requested household; the private wh schema remains unexposed.';

revoke all on function public.autonomy_for(uuid, text) from public, anon;
grant execute on function public.autonomy_for(uuid, text) to authenticated;

notify pgrst, 'reload schema';
