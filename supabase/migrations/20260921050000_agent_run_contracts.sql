-- Specialist contracts on an agent run (story 14-007).
--
-- A run's plan (`agent_runs.plan`) already records every step a specialist
-- proposed. This adds the other half: what specialists handed each other
-- while producing that plan — a meal's missing ingredient becoming a
-- grocery-list entry, say. Recorded alongside the plan rather than in a
-- separate table because a contract has no life of its own outside the run
-- that produced it, the same reasoning `plan` already follows.

alter table public.agent_runs
  add column contracts jsonb not null default '[]'::jsonb;

comment on column public.agent_runs.contracts is
  'What specialists handed each other while planning this run — never raw model text, always {id, type, producedBy, runId, payload}.';

notify pgrst, 'reload schema';
