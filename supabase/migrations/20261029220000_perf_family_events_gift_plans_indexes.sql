-- PERF-17: the household reads of family_events and gift_plans did not use an
-- index. The existing household indexes are partial on status and the
-- repository reads (listEvents, calendar window, familyAgenda gift_plans) do
-- not filter on status, so the planner could not use them.
-- Plain composites; additive and safe in either order with the code.
create index if not exists family_events_household_starts_idx
  on public.family_events (household_id, starts_at);

create index if not exists gift_plans_household_needed_by_idx
  on public.gift_plans (household_id, needed_by);
