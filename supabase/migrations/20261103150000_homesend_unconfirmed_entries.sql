-- HomeSend adds directly, "checking" below the bar (the owner, 2026-11-03:
-- "add the entry directly in WonderHome without asking for a review. If the
-- confidence is less than the threshold set in settings then send a message
-- in HomeTalk and WhatsApp to clarify the confusion").
--
-- Each write HomeSend makes is already a `homesend_changes` row linking the
-- HomeSend item (`intake_id`) to the record it wrote (`domain`, `entity_id`).
-- That row now also carries how sure HomeSend was and whether the entry is
-- still being checked:
--
--   confirmation_state  'unconfirmed' while below the household's bar (the
--                       record shows "Checking", its own reminders wait);
--                       'confirmed' once above it, or a person said it is
--                       right. Every existing row is 'confirmed'.
--   confidence          the reading's score, 0..1, when it had one.
--   confirmed_at / confirmed_by_member_id
--                       when it became confirmed, and by whom when a person
--                       did (null when an answer raised it over the bar).
--
-- Kept on HomeSend's own table (X-003: HomeSend writes only its own tables),
-- so no domain table changes shape.
--
-- Safe in either order: the default keeps every insert that doesn't name the
-- columns 'confirmed' (today's behaviour), and the app reads these columns in
-- a query of its own that falls back to "confirmed" while they are missing.

alter table public.homesend_changes
  add column if not exists confirmation_state text not null default 'confirmed',
  add column if not exists confidence numeric(4, 3),
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by_member_id uuid references public.household_members(id) on delete set null;

alter table public.homesend_changes drop constraint if exists homesend_changes_confirmation_state_check;
alter table public.homesend_changes add constraint homesend_changes_confirmation_state_check
  check (confirmation_state in ('unconfirmed', 'confirmed'));

alter table public.homesend_changes drop constraint if exists homesend_changes_confidence_check;
alter table public.homesend_changes add constraint homesend_changes_confidence_check
  check (confidence is null or (confidence >= 0 and confidence <= 1));

-- A confirmed-by member only on a confirmed row.
alter table public.homesend_changes drop constraint if exists homesend_changes_confirmed_consistent;
alter table public.homesend_changes add constraint homesend_changes_confirmed_consistent
  check (confirmation_state = 'confirmed' or (confirmed_at is null and confirmed_by_member_id is null));

comment on column public.homesend_changes.confirmation_state is
  'unconfirmed: added below the household''s bar, shown as Checking, its reminders held. confirmed: above the bar or a person said it is right.';
comment on column public.homesend_changes.confidence is 'How sure HomeSend was of the reading, 0..1, when it scored one.';
comment on column public.homesend_changes.confirmed_at is 'When an unconfirmed entry became confirmed; null for one added confirmed.';
comment on column public.homesend_changes.confirmed_by_member_id is 'Who said it is right; null when added confirmed or an answer raised it over the bar.';

-- What reminders and the inbox filter on: the household's live entries still being checked.
create index if not exists homesend_changes_unconfirmed_idx
  on public.homesend_changes (household_id, entity_id)
  where confirmation_state = 'unconfirmed' and undone_at is null;
-- Every new foreign key gets an index (CLAUDE.md, Performance).
create index if not exists homesend_changes_confirmed_by_idx
  on public.homesend_changes (confirmed_by_member_id)
  where confirmed_by_member_id is not null;

-- Confirming is one way and in the caller's own name. Any member may say an
-- entry is right, as any member may undo it (the update policy already lets a
-- member update a live change of their household), but:
--   * a confirmed entry never goes back to unconfirmed;
--   * confirmed_by_member_id, when set by a signed-in member, is that member;
--   * an entry's score is never changed by a member (only by the server's
--     answers, which run as the member too, while it moves to confirmed).
-- A trigger rather than a policy check, so undoing an entry someone else
-- confirmed is not refused. The service role (no auth.uid()) is not limited.
create or replace function wh.guard_homesend_confirmation()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if old.confirmation_state = 'confirmed' and new.confirmation_state = 'unconfirmed' then
    raise exception 'a confirmed HomeSend entry cannot be marked unconfirmed again' using errcode = '42501';
  end if;
  if new.confirmed_by_member_id is distinct from old.confirmed_by_member_id
     and new.confirmed_by_member_id is not null
     and not exists (
       select 1 from public.household_members m
       where m.id = new.confirmed_by_member_id
         and m.household_id = new.household_id
         and m.profile_id = (select auth.uid())
         and m.status = 'active'
     ) then
    raise exception 'a HomeSend entry can only be confirmed in your own name' using errcode = '42501';
  end if;
  if new.confidence is distinct from old.confidence
     and not (old.confirmation_state = 'unconfirmed' and new.confirmation_state = 'confirmed') then
    raise exception 'how sure HomeSend was is not changed by hand' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- A trigger function only: nobody calls it directly.
revoke execute on function wh.guard_homesend_confirmation() from public, anon, authenticated;

drop trigger if exists homesend_changes_guard_confirmation on public.homesend_changes;
create trigger homesend_changes_guard_confirmation
  before update on public.homesend_changes
  for each row
  execute function wh.guard_homesend_confirmation();

notify pgrst, 'reload schema';
