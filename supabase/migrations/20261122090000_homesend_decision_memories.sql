-- HomeSend learns from what the household did with its decisions (story
-- 14-083, the owner 2026-11-22: "learnt over time to take the right decision
-- in automated way").
--
-- One row per item HomeSend decided: what it was (title, what it is, the
-- nearest kind and any new kind), the decision (its operations, compact),
-- who sent it, and what people did next: kept, confirmed, corrected (which
-- field to what), undone or answered. On each new item the most similar past
-- decisions of the SAME household are handed to the model as worked
-- examples (`homesend/decision-memory.ts`), so a household's corrections
-- steer the next decision without code changes.
--
-- Guardrails, in the table itself:
--   * a row belongs to one household; every policy is the member's own
--     household set (`wh.member_households()`); nothing is read across
--     households;
--   * it holds no amount and no approval: `decision` keeps capability, op,
--     title and confidence only (written by code that strips the rest);
--   * removed with the household, and with its HomeSend item.
--
-- Safe in either order: a new table. Code that reads it treats a missing
-- table as no memory; code that writes it ignores the error.
-- Rollback: drop table public.homesend_decision_memories.

create table if not exists public.homesend_decision_memories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  intake_id uuid not null references public.home_send_items(id) on delete cascade,
  sender_member_id uuid references public.household_members(id) on delete set null,
  -- An outside sender, as `sender:<address or name>` (the same key `homesend_learned_defaults` uses).
  sender_key text check (sender_key is null or length(sender_key) <= 320),
  title text not null check (length(title) between 1 and 160),
  what_is text check (what_is is null or length(what_is) <= 160),
  nearest_kind text not null check (length(nearest_kind) between 1 and 40),
  new_kind text check (new_kind is null or length(new_kind) <= 60),
  source text not null check (source in ('model', 'reading', 'learned_rule')),
  decision jsonb not null default '[]'::jsonb,
  outcome text not null default 'pending' check (outcome in ('pending', 'kept', 'confirmed', 'corrected', 'undone', 'answered')),
  corrections jsonb not null default '[]'::jsonb,
  embedding extensions.vector(768),
  embedding_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homesend_decision_memories_intake_unique unique (household_id, intake_id)
);

comment on table public.homesend_decision_memories is
  'Each HomeSend decision and what the household did with it (kept, confirmed, corrected, undone, answered); the household''s own similar past decisions are given to the model as worked examples. Never read across households.';

create index if not exists homesend_decision_memories_recent_idx on public.homesend_decision_memories (household_id, created_at desc);
create index if not exists homesend_decision_memories_intake_idx on public.homesend_decision_memories (intake_id);
create index if not exists homesend_decision_memories_sender_idx on public.homesend_decision_memories (sender_member_id);

alter table public.homesend_decision_memories enable row level security;

drop policy if exists homesend_decision_memories_select_member on public.homesend_decision_memories;
create policy homesend_decision_memories_select_member on public.homesend_decision_memories for select
  to authenticated
  using (household_id in (select wh.member_households()));

drop policy if exists homesend_decision_memories_insert_member on public.homesend_decision_memories;
create policy homesend_decision_memories_insert_member on public.homesend_decision_memories for insert
  to authenticated
  with check (household_id in (select wh.member_households()));

drop policy if exists homesend_decision_memories_update_member on public.homesend_decision_memories;
create policy homesend_decision_memories_update_member on public.homesend_decision_memories for update
  to authenticated
  using (household_id in (select wh.member_households()))
  with check (household_id in (select wh.member_households()));

grant select, insert, update on public.homesend_decision_memories to authenticated;
