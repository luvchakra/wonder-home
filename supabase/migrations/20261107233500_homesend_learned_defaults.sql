-- HomeSend learns from an answer, so the same question is never asked twice
-- (story 14-066, the owner 2026-11-07: "least input from user should be
-- expected").
--
-- One row per thing a household told HomeSend once: today, which child an
-- outside sender's items are for (kind 'sender_child', key
-- 'sender:<address or name>'). HomeSend reads it before asking "Who is this
-- for?" (`homesend/learned.ts` `inferSubject`) and writes it when a person
-- answers or picks (`learned-repository.ts`).
--
-- Guardrails, in the table itself:
--   * a row belongs to one household and names a member of that same
--     household (checked on write); it can never point across households;
--   * it is written only as the member who answered (their own membership);
--   * only an Admin clears one (Settings → AI Assistant → "What HomeSend has
--     learned"); every member may see them;
--   * it holds who an item is for and nothing else: no amount, no approval,
--     no permission.
--
-- Safe in either order: a new table. Code that reads it treats a missing
-- table as nothing learned; code that writes it ignores the error.
-- Rollback: drop table public.homesend_learned_defaults.

create table if not exists public.homesend_learned_defaults (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('sender_child')),
  key text not null check (length(key) between 3 and 320),
  value_member_id uuid not null references public.household_members(id) on delete cascade,
  learned_by_member_id uuid references public.household_members(id) on delete set null,
  learned_from_item_id uuid references public.home_send_items(id) on delete set null,
  learned_at timestamptz not null default now(),
  -- The same sender's items were said to be for two different children: it
  -- settles nothing any more, and HomeSend asks again (the wrong-child risk).
  mixed boolean not null default false,
  constraint homesend_learned_defaults_unique unique (household_id, kind, key)
);

comment on table public.homesend_learned_defaults is
  'What a household told HomeSend once (which child a sender''s items are for), so it is not asked again. Admins see and clear it on Settings → AI Assistant.';

-- The unique index leads with household_id and serves every read. Each other foreign key gets its own.
create index if not exists homesend_learned_defaults_value_member_idx on public.homesend_learned_defaults (value_member_id);
create index if not exists homesend_learned_defaults_learned_by_idx on public.homesend_learned_defaults (learned_by_member_id);
create index if not exists homesend_learned_defaults_item_idx on public.homesend_learned_defaults (learned_from_item_id);

alter table public.homesend_learned_defaults enable row level security;

drop policy if exists homesend_learned_defaults_select_member on public.homesend_learned_defaults;
create policy homesend_learned_defaults_select_member on public.homesend_learned_defaults for select
  to authenticated
  using (household_id in (select wh.member_households()));

-- Written as the member who answered, about a member of the same household.
drop policy if exists homesend_learned_defaults_insert_self on public.homesend_learned_defaults;
create policy homesend_learned_defaults_insert_self on public.homesend_learned_defaults for insert
  to authenticated
  with check (
    (household_id, learned_by_member_id) in (select household_id, member_id from wh.my_memberships())
    and (household_id, value_member_id) in (select m.household_id, m.id from public.household_members m where m.household_id in (select wh.member_households()))
  );

-- A later answer replaces an earlier one (the upsert), under the same rules.
drop policy if exists homesend_learned_defaults_update_self on public.homesend_learned_defaults;
create policy homesend_learned_defaults_update_self on public.homesend_learned_defaults for update
  to authenticated
  using (household_id in (select wh.member_households()))
  with check (
    (household_id, learned_by_member_id) in (select household_id, member_id from wh.my_memberships())
    and (household_id, value_member_id) in (select m.household_id, m.id from public.household_members m where m.household_id in (select wh.member_households()))
  );

drop policy if exists homesend_learned_defaults_delete_admin on public.homesend_learned_defaults;
create policy homesend_learned_defaults_delete_admin on public.homesend_learned_defaults for delete
  to authenticated
  using (household_id in (select wh.admin_households()));

grant select, insert, update, delete on public.homesend_learned_defaults to authenticated;

notify pgrst, 'reload schema';
