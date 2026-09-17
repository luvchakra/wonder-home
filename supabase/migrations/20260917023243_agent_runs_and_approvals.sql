-- Agent runs, approvals and tool calls (stories 14-001 through 14-006).
--
-- Applied to the wonder-home Supabase project as version 20260917023243.
--
-- These three tables are what makes "AI agents never directly mutate the
-- database" checkable rather than merely asserted. Every governed tool call is
-- recorded — including, and especially, the refusals — so a household can ask
-- what WonderHome tried to do and get a complete answer.
--
-- None of them is writable from a browser. A run that a client could create,
-- or an approval a client could mark approved, would make the whole governed
-- boundary decorative.

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  initiating_member_id uuid references public.household_members(id) on delete set null,
  -- Ties a run back to the conversation that caused it, when there was one.
  conversation_action_id uuid references public.conversation_actions(id) on delete set null,
  agent_type text not null check (agent_type ~ '^[a-z][a-z0-9_.]{1,60}$'),
  phase text not null default 'observe'
    check (phase in ('observe', 'understand', 'plan', 'act', 'monitor', 'learn', 'done')),
  status text not null default 'running'
    check (status in ('running', 'waiting_for_approval', 'succeeded', 'failed', 'abandoned')),
  plan jsonb not null default '[]'::jsonb,
  completed_steps integer not null default 0 check (completed_steps >= 0),
  -- Safe summary only. Raw prompts and household content stay out of here, as
  -- the security baseline requires of anything an operator might read.
  summary text check (length(trim(summary)) <= 500),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.agent_runs is
  'One pass of the observe-plan-act-monitor loop. Holds a safe summary and the plan, never raw prompts or household content.';

alter table public.agent_runs enable row level security;

create index agent_runs_household_idx on public.agent_runs (household_id, started_at desc);
create index agent_runs_open_idx on public.agent_runs (household_id)
  where status in ('running', 'waiting_for_approval');

create trigger agent_runs_set_updated_at
  before update on public.agent_runs
  for each row execute function wh.set_updated_at();

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete cascade,
  conversation_action_id uuid references public.conversation_actions(id) on delete set null,
  requested_by text not null default 'agent' check (requested_by in ('agent', 'member')),
  approver_member_id uuid references public.household_members(id) on delete set null,
  action_type text not null check (action_type ~ '^[a-z][a-z0-9_.]{1,60}$'),
  -- The exact action, normalised. Approving one payment is not approving a
  -- different bill or a different amount, and this is what enforces that.
  action_fingerprint text not null,
  summary text not null check (length(trim(summary)) between 1 and 300),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired', 'consumed')),
  decided_at timestamptz,
  -- An approval that never expires is standing permission, which is not what
  -- the person thought they were giving.
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approvals_bounded check (expires_at > created_at)
);

comment on table public.approvals is
  'A person''s decision about one exact action. The fingerprint binds it: approving one payment is not approving a different one.';

alter table public.approvals enable row level security;

create index approvals_pending_idx on public.approvals (household_id, created_at desc) where status = 'pending';

-- One pending approval per action, so a household is not asked the same
-- question twice and cannot answer it two different ways.
create unique index approvals_one_pending_per_action
  on public.approvals (household_id, action_fingerprint) where status = 'pending';

create trigger approvals_set_updated_at
  before update on public.approvals
  for each row execute function wh.set_updated_at();

create table public.agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  tool_name text not null,
  outcome text not null check (outcome in ('executed', 'awaiting_approval', 'refused')),
  refusal_code text check (refusal_code in
    ('unknown_tool', 'cross_household', 'not_entitled', 'missing_permission', 'autonomy_forbids')),
  reason text check (length(trim(reason)) <= 300),
  created_at timestamptz not null default now()
);

comment on table public.agent_tool_calls is
  'Every governed tool call an agent made, including the refusals. A refusal is the more interesting record.';

alter table public.agent_tool_calls enable row level security;

create index agent_tool_calls_run_idx on public.agent_tool_calls (agent_run_id, created_at);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Read-only throughout. A member can see what WonderHome did on their
-- household's behalf and what it was refused; the tool-call detail is an
-- administrator's view because it is operational rather than everyday.
-- ---------------------------------------------------------------------------

create policy agent_runs_select_member on public.agent_runs for select
  to authenticated using (wh.is_member(household_id));

create policy approvals_select_member on public.approvals for select
  to authenticated using (wh.is_member(household_id));

create policy agent_tool_calls_select_admin on public.agent_tool_calls for select
  to authenticated using (wh.is_household_admin(household_id));

notify pgrst, 'reload schema';
