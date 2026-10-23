-- HomeBrain's stored household context is marked stale on any write to a
-- table it reads (HomeBrain 4.0 §3.8, `wh.mark_context_stale`), not only the
-- tables listed when the safety net was first laid (the owner's report,
-- 2026-10-23: HomeTalk did not know about records added that day that the
-- Calendar already showed). Each table below is read by a context adapter
-- (`context/repository.ts`) or the store's own read and had no trigger.
--
-- The trigger only touches a row that is currently fresh, so a bulk write
-- costs one update, not one per row. Rollback: drop each
-- `<table>_marks_context_stale` trigger.

do $tables$
declare
  name text;
begin
  foreach name in array array[
    'child_activity_notes', 'event_exceptions',
    'health_appointments', 'health_checkups', 'health_issues', 'health_records', 'health_vitals', 'health_fitness_goals', 'health_fitness_sessions',
    'outcomes', 'orders', 'consumable_purchases', 'inventory_balances', 'meal_ingredient_needs',
    'school_communications', 'member_relationships', 'member_languages', 'household_addresses', 'household_roles',
    'home_send_items', 'homesend_changes', 'gift_plans', 'playbook_items', 'policies', 'purchase_policies'
  ] loop
    execute format(
      'create or replace trigger %I after insert or update or delete on public.%I for each row execute function wh.mark_context_stale()',
      name || '_marks_context_stale', name
    );
  end loop;
end;
$tables$;
