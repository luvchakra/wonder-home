-- Nothing stuck in review, part A "Nothing waits" (the owner, 2026-11-14:
-- "minimum intervention is required to input information in the app, ensure
-- it's not stuck in review, and minimum info is pending for review";
-- docs/design/2026-11-14-nothing-stuck-in-review.md).
--
-- 1. `needs_you_items`: the one "Needs you" list. Every question WonderHome
--    asks a person (HomeSend's Checking questions, a waiting item's one
--    question, "send it again?", and parts B and C's "Trust this sender?" and
--    conflicts) is one row here, with its tap answers, a stored default and
--    two deadlines (decision 4): the default applies at `default_at` (24 h
--    after asking) and nothing stays open past `expires_at` (48 h). Closed
--    words only in `prompt` and `answers`; the item's own title is the one
--    piece of household content, shown to the people who may see the item.
-- 2. Three more reasons an item is set aside, so every item ends as
--    something: `not_household` (a pasted web page, an ad, a newsletter),
--    `kept_as_note` (couldn't tell what it is: kept as a household note
--    HomeTalk can find), `not_resent` (unreadable, asked once to resend, no
--    new copy within 24 h).
--
-- Safe in either order: the app reads the new table in a query of its own
-- that is empty while the table is missing, and writes the new reasons only
-- after it has seen the table; nothing that reads home_send_items selects a
-- new column.

alter table public.home_send_items drop constraint if exists home_send_items_archive_reason_check;
alter table public.home_send_items add constraint home_send_items_archive_reason_check
  check (archive_reason is null or archive_reason in (
    'untouched_30_days', 'past_date', 'already_recorded', 'superseded', 'cancelled', 'unreadable', 'removed_by_person',
    'not_household', 'kept_as_note', 'not_resent'
  ));

-- HomeTalk finds household notes by these.
create index if not exists home_send_items_notes_idx
  on public.home_send_items (household_id, created_at desc)
  where status = 'archived' and archive_reason = 'kept_as_note';

create table if not exists public.needs_you_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- Who adds it: homesend_check, homesend_waiting, homesend_resend (part A),
  -- sender_trust (part B), conflict (part C). Open to new sources without a migration.
  source text not null check (source ~ '^[a-z][a-z0-9_]{1,40}$'),
  -- What it is about: a home_send_items row, a homesend_changes row, an approval.
  subject_table text not null check (subject_table ~ '^[a-z][a-z0-9_]{1,60}$'),
  subject_id uuid not null,
  -- Who is asked. Null: the household's Admins.
  recipient_member_id uuid references public.household_members(id) on delete set null,
  -- The question as a closed code and its parameters; worded by the screen in the reader's language.
  prompt jsonb not null check (jsonb_typeof(prompt) = 'object' and prompt ? 'code'),
  -- The tap answers, as closed values; the first is the one offered first.
  answers jsonb not null check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) between 1 and 4),
  -- What happens if nobody answers, and when.
  default_answer text not null check (default_answer ~ '^[a-z][a-z0-9_]{0,40}$'),
  default_at timestamptz not null,
  expires_at timestamptz not null,
  -- How much it matters (3 money due soon, 2 a school deadline, 1 a dated thing, 0 the rest) and its day, for ranking.
  consequence smallint not null default 0 check (consequence between 0 and 3),
  due_on date,
  status text not null default 'open' check (status in ('open', 'answered', 'defaulted', 'expired', 'withdrawn')),
  answer text check (answer is null or answer ~ '^[a-z][a-z0-9_]{0,40}$'),
  answered_by_member_id uuid references public.household_members(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint needs_you_items_deadlines check (default_at <= expires_at and expires_at <= created_at + interval '48 hours' + interval '1 minute'),
  constraint needs_you_items_resolved check ((status = 'open') = (resolved_at is null)),
  constraint needs_you_items_answered check (status <> 'answered' or answer is not null)
);

comment on table public.needs_you_items is
  'The one "Needs you" list: every question WonderHome asks a person, with tap answers, a default that applies after 24 h and nothing open past 48 h (decision 4, 2026-11-14).';

alter table public.needs_you_items enable row level security;

-- One open question per thing per source.
create unique index if not exists needs_you_items_one_open
  on public.needs_you_items (source, subject_id) where status = 'open';
-- The list and its count, per household.
create index if not exists needs_you_items_open_idx
  on public.needs_you_items (household_id, consequence desc, created_at) where status = 'open';
-- The deadlines step: what is due now, across households.
create index if not exists needs_you_items_due_idx
  on public.needs_you_items (default_at) where status = 'open';
-- Every foreign key gets an index (CLAUDE.md, Performance).
create index if not exists needs_you_items_recipient_idx
  on public.needs_you_items (recipient_member_id) where recipient_member_id is not null;
create index if not exists needs_you_items_answered_by_idx
  on public.needs_you_items (answered_by_member_id) where answered_by_member_id is not null;
-- The Platform admin measures: resolved in a window.
create index if not exists needs_you_items_resolved_idx
  on public.needs_you_items (household_id, resolved_at) where status <> 'open';

drop trigger if exists needs_you_items_set_updated_at on public.needs_you_items;
create trigger needs_you_items_set_updated_at
  before update on public.needs_you_items
  for each row execute function wh.set_updated_at();

-- Seen by the person asked, or by an Admin when it is for the Admins (or for anyone).
drop policy if exists needs_you_items_select on public.needs_you_items;
create policy needs_you_items_select on public.needs_you_items
  for select to authenticated
  using (
    household_id in (select wh.admin_households())
    or (household_id, recipient_member_id) in (select household_id, member_id from wh.my_memberships())
  );

-- Asked by the household's own server code, as a member (parts B and C add rows this way).
drop policy if exists needs_you_items_insert on public.needs_you_items;
create policy needs_you_items_insert on public.needs_you_items
  for insert to authenticated
  with check (household_id in (select wh.member_households()) and status = 'open');

-- Answered by whoever may see it.
drop policy if exists needs_you_items_update on public.needs_you_items;
create policy needs_you_items_update on public.needs_you_items
  for update to authenticated
  using (
    household_id in (select wh.admin_households())
    or (household_id, recipient_member_id) in (select household_id, member_id from wh.my_memberships())
  )
  with check (
    household_id in (select wh.admin_households())
    or (household_id, recipient_member_id) in (select household_id, member_id from wh.my_memberships())
  );

-- An answer is in the answerer's own name, and a closed question stays closed.
create or replace function wh.guard_needs_you_answer()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if old.status <> 'open' and new.status is distinct from old.status then
    raise exception 'a closed question stays closed' using errcode = '42501';
  end if;
  if new.household_id is distinct from old.household_id
     or new.subject_id is distinct from old.subject_id
     or new.default_answer is distinct from old.default_answer
     or new.default_at is distinct from old.default_at
     or new.expires_at is distinct from old.expires_at then
    raise exception 'a question''s default and deadlines are not changed by hand' using errcode = '42501';
  end if;
  if new.answered_by_member_id is distinct from old.answered_by_member_id
     and new.answered_by_member_id is not null
     and not exists (
       select 1 from public.household_members m
       where m.id = new.answered_by_member_id
         and m.household_id = new.household_id
         and m.profile_id = (select auth.uid())
         and m.status = 'active'
     ) then
    raise exception 'a question is answered in your own name' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function wh.guard_needs_you_answer() from public, anon, authenticated;

drop trigger if exists needs_you_items_guard_answer on public.needs_you_items;
create trigger needs_you_items_guard_answer
  before update on public.needs_you_items
  for each row execute function wh.guard_needs_you_answer();

grant select, insert, update on public.needs_you_items to authenticated;
grant all on public.needs_you_items to service_role;

notify pgrst, 'reload schema';

-- 3. The Platform admin measures for "Nothing waits" (aggregate only, like
--    public.platform_overview: counts and ages, never a household id, name or
--    content). Its own function so the Overview's big one is not rewritten;
--    the page shows "not measured" while it is missing.
create or replace function public.platform_nothing_waits(p_staff_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_result jsonb;
begin
  if p_staff_profile_id is null or not exists (
    select 1 from public.platform_admins a
    where a.profile_id = p_staff_profile_id and a.status = 'active'
  ) then
    raise exception 'platform staff only' using errcode = '42501';
  end if;

  with
  sent as (
    select i.id, i.status, i.review_decision
    from public.home_send_items i
    where i.created_at >= v_now - interval '30 days'
  ),
  open_needs as (
    select n.household_id, count(*) as open, extract(epoch from (v_now - min(n.created_at))) / 3600 as oldest_hours
    from public.needs_you_items n
    where n.status = 'open'
    group by n.household_id
  ),
  added as (
    select c.created_at, c.undone_at
    from public.homesend_changes c
    where c.created_at >= v_now - interval '30 days' and c.change_type = 'created'
  )
  select jsonb_build_object(
    -- Sends that needed a person, out of every send in the last 30 days: a person's review, a question a person answered, or still waiting.
    'neededPerson', jsonb_build_object(
      'count', (select count(*) from sent s where s.status in ('received', 'classified', 'failed')
        or s.review_decision in ('added', 'updated', 'cancelled', 'kept_existing', 'dismissed')
        or exists (select 1 from public.needs_you_items n where n.subject_id = s.id and n.status = 'answered')),
      'of', (select count(*) from sent)),
    -- Open "Needs you" items, per household (anonymous), oldest first.
    'openByHousehold', coalesce((select jsonb_agg(jsonb_build_object('open', o.open, 'oldestHours', floor(o.oldest_hours)) order by o.oldest_hours desc)
      from (select * from open_needs order by oldest_hours desc limit 20) o), '[]'::jsonb),
    'openTotal', (select coalesce(sum(o.open), 0) from open_needs o),
    -- Entries still Checking more than 7 days after they were added with no stated reason; and those kept
    -- Checking on purpose (a money or health entry whose question closed: "check before paying").
    'checkingOver7d', (select count(*) from public.homesend_changes c
      where c.confirmation_state = 'unconfirmed' and c.undone_at is null and c.created_at < v_now - interval '7 days'
        and not exists (select 1 from public.needs_you_items n where n.subject_id = c.intake_id and n.source = 'homesend_check' and n.status <> 'open' and coalesce(n.answer, n.default_answer) = 'keep_checking')),
    'checkingKept', (select count(*) from public.homesend_changes c
      where c.confirmation_state = 'unconfirmed' and c.undone_at is null and c.created_at < v_now - interval '7 days'
        and exists (select 1 from public.needs_you_items n where n.subject_id = c.intake_id and n.source = 'homesend_check' and n.status <> 'open' and coalesce(n.answer, n.default_answer) = 'keep_checking')),
    -- Entries undone (a "Not right" included) within 7 days of being added, out of those added in the last 30 days.
    'undoneWithin7d', jsonb_build_object(
      'count', (select count(*) from added a where a.undone_at is not null and a.undone_at < a.created_at + interval '7 days'),
      'of', (select count(*) from added))
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.platform_nothing_waits(uuid) from public, anon, authenticated;
grant execute on function public.platform_nothing_waits(uuid) to service_role;

comment on function public.platform_nothing_waits(uuid) is
  '"Nothing waits" measures for the platform-admin Overview: sends that needed a person, open Needs-you items per household (anonymous), Checking entries over 7 days, entries undone within 7 days. service_role only; aggregate only.';

-- What the measures filter on.
create index if not exists needs_you_items_subject_idx on public.needs_you_items (subject_id);
