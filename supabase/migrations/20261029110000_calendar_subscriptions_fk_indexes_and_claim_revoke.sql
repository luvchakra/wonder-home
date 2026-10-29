-- Performance + security quick wins (PERF-01, SEC-08; plan 2026-10-29).
--
-- 1. Cover the two foreign keys on calendar_subscriptions the performance
--    advisor flags (unindexed_foreign_keys), so member deletes and owner
--    lookups do not scan the table.
create index if not exists calendar_subscriptions_owner_member_idx
  on public.calendar_subscriptions (owner_member_id);
create index if not exists calendar_subscriptions_created_by_idx
  on public.calendar_subscriptions (created_by_member_id);

-- 2. The feed-claim function is a worker (service role only). The earlier
--    `revoke ... from public` left the direct `anon` grant that Supabase's
--    default privileges add, so signed-out callers could still reach it through
--    /rest/v1/rpc (advisor lint 0028). Close it for every client role.
revoke all on function public.claim_due_calendar_subscriptions(integer) from public, anon, authenticated;
grant execute on function public.claim_due_calendar_subscriptions(integer) to service_role;
