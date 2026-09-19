-- Letting a household change its own plan (story 20-004).
--
-- `household_subscriptions` has carried a select policy since the plans
-- migration and no write policy at all, because until now nothing changed a
-- plan: the row was seeded and read. A household that can upgrade needs to be
-- able to write it.
--
-- Administrators only, matching every other household-level setting. The
-- application checks this first and is authoritative; this is the second line,
-- and it is the one that still holds if a route is ever added that forgets.
--
-- Deliberately no delete policy. A household without a subscription row falls
-- back to the free plan by default, so deleting one is a way to change plan
-- without leaving a trail — and `subscription.changed` is written on the way
-- through the application path, not by a trigger that a direct delete would
-- bypass.

create policy household_subscriptions_insert_admin on public.household_subscriptions for insert
  to authenticated with check (wh.is_household_admin(household_id));

create policy household_subscriptions_update_admin on public.household_subscriptions for update
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

notify pgrst, 'reload schema';
