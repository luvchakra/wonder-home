-- Story 20-007 follow-up: plan_policy_events is server-only, and says so with
-- an explicit deny-all policy, the same convention as rate_limit_counters —
-- a table with RLS on and no policy at all reads as an oversight, not a choice.

create policy plan_policy_events_no_client_access
  on public.plan_policy_events for all
  to anon, authenticated
  using (false)
  with check (false);
