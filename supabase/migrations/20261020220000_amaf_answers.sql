-- Ask me about family (AMAF): what HomeTalk asked a person about their
-- family, what they said, and what it did with it (the owner, 2026-10-20).
--
-- One row per answer. It is three things at once:
-- - what keeps a question from coming back too soon (`outcome`, `created_at`);
-- - the provenance of a value AMAF wrote ("told to HomeTalk by Kunal on
--   12 Oct"), said back when a later answer disagrees with it;
-- - the undo record: `previous` holds what the record said before, so
--   "undo" puts it back through the same domain service a screen uses.
-- The answer itself lives in the conversation; `value` keeps only the
-- shape that was written, never the whole sentence.
--
-- Rollback: drop table public.amaf_answers;

create table if not exists public.amaf_answers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.household_members (id) on delete cascade,
  fact_key text not null check (char_length(fact_key) between 1 and 80),
  subject_id text check (subject_id is null or char_length(subject_id) <= 80),
  outcome text not null check (outcome in ('saved', 'confirmed', 'kept', 'changed', 'noted', 'none', 'dont_know', 'skipped', 'refused')),
  value jsonb,
  previous jsonb,
  record_id text check (record_id is null or char_length(record_id) <= 80),
  message_id uuid,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists amaf_answers_household_idx on public.amaf_answers (household_id, created_at desc);
create index if not exists amaf_answers_fact_idx on public.amaf_answers (household_id, fact_key, subject_id);
create index if not exists amaf_answers_member_idx on public.amaf_answers (member_id);

alter table public.amaf_answers enable row level security;

-- Every member of the household may read them: they are the source of what
-- the household was told, and say who told it.
drop policy if exists amaf_answers_read on public.amaf_answers;
create policy amaf_answers_read on public.amaf_answers
  for select to authenticated
  using (household_id in (select wh.member_households()));

-- A person records only their own answers.
drop policy if exists amaf_answers_insert_own on public.amaf_answers;
create policy amaf_answers_insert_own on public.amaf_answers
  for insert to authenticated
  with check ((household_id, member_id) in (select household_id, member_id from wh.my_memberships()));

-- And marks only their own answer undone.
drop policy if exists amaf_answers_update_own on public.amaf_answers;
create policy amaf_answers_update_own on public.amaf_answers
  for update to authenticated
  using ((household_id, member_id) in (select household_id, member_id from wh.my_memberships()))
  with check ((household_id, member_id) in (select household_id, member_id from wh.my_memberships()));

grant select, insert, update on public.amaf_answers to authenticated;

comment on table public.amaf_answers is
  'Ask me about family: each answer a person gave HomeTalk, what it did (outcome), what the record said before (previous, for undo), and so the source of what AMAF wrote.';

notify pgrst, 'reload schema';
