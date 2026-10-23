-- The household record index, Phase 1 (design/HOUSEHOLD-RECORD-INDEX.md):
-- every table HomeBrain reads as knowledge marks its stored household
-- context stale on a write (`wh.mark_context_stale`, HomeBrain 4.0 §3.8).
-- These are the tables `knowledge/registry.ts` reads that had no trigger;
-- `scripts/lint-knowledge-registry.mjs` now fails CI for the next one.
--
-- Rollback: drop each `<table>_marks_context_stale` trigger.

do $tables$
declare
  name text;
begin
  foreach name in array array[
    'agent_runs', 'certification_items', 'integrations', 'obligation_history',
    'asset_service_events', 'backup_services', 'budgets', 'health_measurement_routines', 'health_record_readings',
    'helper_profiles', 'member_availability', 'member_work_places', 'order_items', 'routines', 'school_documents', 'study_sessions'
  ] loop
    execute format(
      'create or replace trigger %I after insert or update or delete on public.%I for each row execute function wh.mark_context_stale()',
      name || '_marks_context_stale', name
    );
  end loop;
end;
$tables$;
