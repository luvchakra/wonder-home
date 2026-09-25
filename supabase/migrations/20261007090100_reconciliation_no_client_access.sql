-- Reconciliation tables follow the repo's server-only pattern (story 20-011):
-- the usual grants, and a policy that lets no session through, so a household
-- sees nothing rather than a permission error — the same shape as
-- `payment_provider_plans`. The tenant-isolation suite checks every table has
-- a policy and that none leaks across households; a bare REVOKE failed both.
grant select, insert, update, delete on public.billing_reconciliation_runs to anon, authenticated;
grant select, insert, update, delete on public.billing_reconciliation_findings to anon, authenticated;

create policy billing_reconciliation_runs_no_client_access
  on public.billing_reconciliation_runs for all
  to anon, authenticated
  using (false)
  with check (false);

create policy billing_reconciliation_findings_no_client_access
  on public.billing_reconciliation_findings for all
  to anon, authenticated
  using (false)
  with check (false);

notify pgrst, 'reload schema';
