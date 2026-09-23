-- Narrow public wrappers for three wh.* functions the application calls by
-- RPC.
--
-- PostgREST only resolves RPC calls against its exposed schemas, which is
-- `public` alone. The application called `rpc("autonomy_for")`,
-- `rpc("record_usage")` and `rpc("busy_windows")`, but all three functions
-- live only in `wh`, so every call answered 404 / PGRST202. Each caller
-- failed closed — the agent runtime treated every household as "observe",
-- usage metering silently recorded nothing, and availability threw — which
-- was safe but meant a household's configured autonomy never took effect.
--
-- The fix exposes exactly these three functions, one wrapper each, and
-- nothing else: `wh` stays unexposed, no business logic is duplicated, and
-- each wrapper is granted only to the role its real caller runs as.
--
--   public.autonomy_for  → service_role only. wh.autonomy_for has no
--                          membership check of its own (it trusts its
--                          caller), so it must never be reachable by a
--                          browser session: the agent runtime calls it from
--                          the server with the admin client, for a household
--                          the request was already authorised against.
--   public.record_usage  → service_role only. Metering is the server's to
--                          record (the plans migration already says so): a
--                          member who could call it could spend or refund
--                          another household's allowance.
--   public.busy_windows  → authenticated only. wh.busy_windows enforces
--                          membership itself through wh.is_member(auth.uid()),
--                          reading the caller's own JWT — called with the
--                          service role it would see no member and return
--                          nothing, so it stays on the member's own client.
--
-- `create or replace` keeps this safe to re-apply; the explicit revokes undo
-- Supabase's default EXECUTE-to-everyone on new public functions.

create or replace function public.autonomy_for(p_household_id uuid, p_outcome_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select wh.autonomy_for(p_household_id, p_outcome_key);
$$;

comment on function public.autonomy_for(uuid, text) is
  'Server-only wrapper for wh.autonomy_for (the configured autonomy for an outcome, defaulting to observe). Callable by service_role only.';

revoke all on function public.autonomy_for(uuid, text) from public;
revoke all on function public.autonomy_for(uuid, text) from anon;
revoke all on function public.autonomy_for(uuid, text) from authenticated;
grant execute on function public.autonomy_for(uuid, text) to service_role;

create or replace function public.record_usage(
  p_household_id uuid,
  p_feature_key text,
  p_period_start timestamptz,
  p_amount integer default 1,
  p_limit integer default null
)
returns table (used bigint, allowed boolean)
language sql
security definer
set search_path = ''
as $$
  select r.used, r.allowed from wh.record_usage(p_household_id, p_feature_key, p_period_start, p_amount, p_limit) r;
$$;

comment on function public.record_usage(uuid, text, timestamptz, integer, integer) is
  'Server-only wrapper for wh.record_usage (atomic usage metering). Callable by service_role only.';

revoke all on function public.record_usage(uuid, text, timestamptz, integer, integer) from public;
revoke all on function public.record_usage(uuid, text, timestamptz, integer, integer) from anon;
revoke all on function public.record_usage(uuid, text, timestamptz, integer, integer) from authenticated;
grant execute on function public.record_usage(uuid, text, timestamptz, integer, integer) to service_role;

create or replace function public.busy_windows(p_household_id uuid, p_from timestamptz, p_to timestamptz)
returns table (member_id uuid, busy_from timestamptz, busy_to timestamptz, protected boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select b.member_id, b.busy_from, b.busy_to, b.protected from wh.busy_windows(p_household_id, p_from, p_to) b;
$$;

comment on function public.busy_windows(uuid, timestamptz, timestamptz) is
  'Wrapper for wh.busy_windows (free/busy only). Membership is enforced inside, from the caller''s own JWT, so it is granted to authenticated only.';

revoke all on function public.busy_windows(uuid, timestamptz, timestamptz) from public;
revoke all on function public.busy_windows(uuid, timestamptz, timestamptz) from anon;
revoke all on function public.busy_windows(uuid, timestamptz, timestamptz) from service_role;
grant execute on function public.busy_windows(uuid, timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';
