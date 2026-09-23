-- Wave 5 (story 14-013), §13 and §20.
--
-- §13 — a correction is structured evaluation evidence. Whenever a person
-- corrects what WonderHome understood, whether that is "no, I meant Manan"
-- in HomeTalk or fixing a HomeSend reading before confirming it, one row
-- per corrected field records:
--   - what was believed and what the person said;
--   - which §10-style error that was;
--   - which prompt version was running, and whether a model or the rules
--     had produced it.
-- The rows are append-only. A later correction adds a row and never
-- rewrites an earlier one, so the historical signal survives for error
-- analysis ("never erase the historical evaluation signal"). They go only
-- when the household itself is deleted.
--
-- Writes come only from the server, after the turn's or the review's own
-- authorization, through the service role. Members have no insert, update
-- or delete. A household's admins can read their own household's evidence.
-- Platform metrics count only the closed words (surface, error_type,
-- field), never the values.
--
-- §20 — an approval binds to the exact proposal. Each HomeTalk proposal
-- stores a fingerprint of exactly what it would do: the action, its target
-- and every parameter (so the amount, the person and the date). An
-- approval is honoured only when that fingerprint is unchanged and matches
-- what the person was shown, and only inside the proposal's time limit.
-- Anything else is rejected as stale, and a new approval is asked for.

create table public.ai_corrections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  surface text not null check (surface in ('hometalk', 'homesend', 'homebrain')),
  source_type text not null check (source_type in ('conversation_action', 'home_send_item', 'certification_item')),
  source_id uuid,
  error_type text not null check (error_type in (
    'false_entity_match', 'wrong_date', 'wrong_interpretation', 'wrong_amount', 'wrong_item', 'wrong_classification', 'wrong_fact'
  )),
  field text not null check (field ~ '^[a-z][a-zA-Z0-9_]{0,40}$'),
  model_value text check (model_value is null or length(model_value) <= 200),
  human_value text check (human_value is null or length(human_value) <= 200),
  understanding_source text check (understanding_source is null or understanding_source in ('model', 'rules')),
  prompt_version text check (prompt_version is null or prompt_version ~ '^p-[0-9a-f]{12}$'),
  corrected_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.ai_corrections is
  'Wave 5 §13: a person''s correction of what WonderHome understood, one row per corrected field, kept as evaluation evidence. Append-only; written by the server only.';
comment on column public.ai_corrections.error_type is
  'What kind of mistake the correction reveals, in closed words — the only column platform metrics count, alongside surface and field.';
comment on column public.ai_corrections.prompt_version is
  'The prompt version (`npm run eval`''s p-… hash) running when the correction was made, so a correction can be traced to the prompts that produced the mistake.';

alter table public.ai_corrections enable row level security;

create policy ai_corrections_admin_read on public.ai_corrections
  for select to authenticated
  using (wh.is_household_admin(household_id));

revoke insert, update, delete on public.ai_corrections from anon, authenticated;

-- Append-only, even for the server: evidence is never rewritten.
create or replace function wh.ai_corrections_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ai_corrections is append-only: add a new correction instead of changing one'
    using errcode = 'P0001';
end;
$$;

create trigger ai_corrections_no_update
  before update on public.ai_corrections
  for each row execute function wh.ai_corrections_append_only();

create index ai_corrections_household_created on public.ai_corrections (household_id, created_at desc);
create index ai_corrections_created on public.ai_corrections (created_at);

alter table public.conversation_actions
  add column approval_fingerprint text
    check (approval_fingerprint is null or approval_fingerprint ~ '^fp-[0-9a-f]{16}$');

comment on column public.conversation_actions.approval_fingerprint is
  'Wave 5 §20: a hash of exactly what this proposal would do (action, target, every parameter). An approval is honoured only while it still matches, and only when it matches what the person was shown.';

notify pgrst, 'reload schema';
