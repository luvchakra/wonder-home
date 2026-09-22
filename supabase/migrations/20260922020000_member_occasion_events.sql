-- Auto-syncing family_events from a member's birthday and special-occasion
-- date (product feedback: "add trigger to update events when a birthday or
-- any special occasion date is added, updated or removed").
--
-- `household_members.date_of_birth` and `.special_occasion_date` (the
-- latter added in 20260921070000, "a date worth remembering besides a
-- birthday — an anniversary, a graduation") already exist; nothing reads
-- them into the shared calendar yet. `family_events.kind` already allows
-- 'birthday' — this adds 'special_occasion' alongside it and a trigger that
-- keeps one derived event per member per occasion in step with the date
-- that produces it, rather than asking a household to remember to add it
-- twice.
--
-- Scope: this keeps the *next upcoming* occurrence in sync, computed in the
-- household's own timezone so a birthday near midnight lands on the day the
-- household actually experiences. `family_events` has no recurrence concept
-- (every event is a single starts_at/ends_at window, by design — see
-- 20260917165018's own comment on why a confirmed commitment is a concrete
-- constraint rather than a rule an optimiser interprets), so this derives
-- one event for whichever occurrence hasn't happened yet; a household that
-- wants next year's on the calendar today would need `family_events` to grow
-- real recurrence, which is a bigger change than this trigger's job.

alter table public.family_events
  drop constraint family_events_kind_check;

alter table public.family_events
  add constraint family_events_kind_check check (kind in
    ('family_time', 'outing', 'birthday', 'gathering', 'appointment', 'school_event', 'travel', 'special_occasion'));

-- The next date (in `p_from`'s calendar, ignoring year) that `p_month_day`
-- falls on — this year if it hasn't happened yet, next year otherwise. A
-- 29 February observed in a non-leap year lands on the 28th rather than
-- raising, the same convention most calendar apps use for a leap birthday.
create or replace function wh.next_occurrence(p_month_day date, p_from date)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_year int := extract(year from p_from)::int;
  v_month int := extract(month from p_month_day)::int;
  v_day int := extract(day from p_month_day)::int;
  v_candidate date;
begin
  begin
    v_candidate := make_date(v_year, v_month, v_day);
  exception when others then
    v_candidate := make_date(v_year, v_month, 28);
  end;

  if v_candidate < p_from then
    v_year := v_year + 1;
    begin
      v_candidate := make_date(v_year, v_month, v_day);
    exception when others then
      v_candidate := make_date(v_year, v_month, 28);
    end;
  end if;

  return v_candidate;
end;
$$;

comment on function wh.next_occurrence(date, date) is
  'The next date p_month_day falls on (year ignored, matched by month/day) at or after p_from. A 29 Feb in a non-leap year observes on the 28th.';

create or replace function wh.sync_member_occasion_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_household_tz text;
  v_today date;
  v_birthday_id uuid;
  v_occasion_id uuid;
  v_next date;
  v_removed boolean;
begin
  v_row := coalesce(new, old);
  v_removed := (tg_op = 'DELETE') or (v_row.status = 'inactive');

  select timezone into v_household_tz from public.households where id = v_row.household_id;
  v_today := (now() at time zone coalesce(v_household_tz, 'UTC'))::date;

  select id into v_birthday_id from public.family_events
    where household_id = v_row.household_id and owner_member_id = v_row.id
      and kind = 'birthday' and external_id = 'member_birthday:' || v_row.id::text;

  if not v_removed and v_row.date_of_birth is not null then
    v_next := wh.next_occurrence(v_row.date_of_birth, v_today);
    if v_birthday_id is null then
      insert into public.family_events
        (household_id, title, kind, starts_at, ends_at, owner_member_id, status, external_id)
      values
        (v_row.household_id, v_row.display_name || '''s birthday', 'birthday',
         v_next::timestamptz, (v_next + 1)::timestamptz, v_row.id, 'confirmed',
         'member_birthday:' || v_row.id::text);
    else
      update public.family_events
        set title = v_row.display_name || '''s birthday', starts_at = v_next::timestamptz, ends_at = (v_next + 1)::timestamptz
        where id = v_birthday_id;
    end if;
  elsif v_birthday_id is not null then
    delete from public.family_events where id = v_birthday_id;
  end if;

  select id into v_occasion_id from public.family_events
    where household_id = v_row.household_id and owner_member_id = v_row.id
      and kind = 'special_occasion' and external_id = 'member_special_occasion:' || v_row.id::text;

  if not v_removed and v_row.special_occasion_date is not null then
    v_next := wh.next_occurrence(v_row.special_occasion_date, v_today);
    if v_occasion_id is null then
      insert into public.family_events
        (household_id, title, kind, starts_at, ends_at, owner_member_id, status, external_id)
      values
        (v_row.household_id, coalesce(v_row.special_occasion_label, v_row.display_name || '''s special day'),
         'special_occasion', v_next::timestamptz, (v_next + 1)::timestamptz, v_row.id, 'confirmed',
         'member_special_occasion:' || v_row.id::text);
    else
      update public.family_events
        set title = coalesce(v_row.special_occasion_label, v_row.display_name || '''s special day'),
            starts_at = v_next::timestamptz, ends_at = (v_next + 1)::timestamptz
        where id = v_occasion_id;
    end if;
  elsif v_occasion_id is not null then
    delete from public.family_events where id = v_occasion_id;
  end if;

  return v_row;
end;
$$;

comment on function wh.sync_member_occasion_events() is
  'Keeps one derived family_events row per member per occasion (birthday, special_occasion) in step with household_members.date_of_birth/special_occasion_date/special_occasion_label — added, changed or cleared.';

create trigger household_members_sync_occasion_events
  after insert or update of date_of_birth, special_occasion_date, special_occasion_label, display_name, status
  on public.household_members
  for each row execute function wh.sync_member_occasion_events();

create trigger household_members_remove_occasion_events
  after delete on public.household_members
  for each row execute function wh.sync_member_occasion_events();

notify pgrst, 'reload schema';
