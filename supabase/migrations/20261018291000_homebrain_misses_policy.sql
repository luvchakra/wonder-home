-- homebrain_misses (20261018290000) in the repo's server-only shape
-- (`household_context`, `payment_provider_plans`): the usual grants and a
-- policy that lets no session through, so a session sees no rows rather than
-- a permission error and the tenant-isolation suite reads it as any other
-- household table. Still written only by the service role.

grant select, insert, update, delete on public.homebrain_misses to anon, authenticated;

create policy homebrain_misses_no_client_access
  on public.homebrain_misses for all
  to anon, authenticated
  using (false)
  with check (false);
