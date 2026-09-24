-- payment_provider_plans (story 20-009) is server-only: which provider plan or
-- price backs one of our prices is configuration the browser never sees. It
-- shipped with RLS on and no policy at all, which scripts/test-tenant-isolation-rls.mjs
-- rightly treats as "unreachable or unprotected". An explicit deny-all policy
-- states the intent — the same convention as rate_limit_counters and
-- plan_policy_events — and changes nothing any session can do.
create policy payment_provider_plans_no_client_access
  on public.payment_provider_plans for all
  to anon, authenticated
  using (false)
  with check (false);

notify pgrst, 'reload schema';
