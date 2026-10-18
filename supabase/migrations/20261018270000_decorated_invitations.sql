-- Decorated invitations (story 26-009), and member occasions that read as the
-- whole day they are.
--
-- 1. An event's invitation has a design and an optional message for guests.
--    invite_template null means "chosen from the event itself" (its kind and
--    title, by rules in packages/core/src/family/invite-templates.ts). The
--    message is the only extra text a guest sees: notes stay with the
--    household, so writing a note never publishes it through the link.
--
-- 2. The member-occasion trigger wrote a birthday as UTC midnight to UTC
--    midnight with all_day false, so in India it read "5:30 am – 5:30 am".
--    It now writes the household's own local day, as an all-day event, and
--    the rows it already wrote are moved onto that day.

alter table public.family_events
  add column invite_template text check (
    invite_template is null
    or invite_template in ('birthday', 'anniversary', 'wedding', 'festival', 'puja', 'housewarming', 'baby', 'dinner', 'classic')
  ),
  add column invite_message text check (invite_message is null or length(invite_message) <= 300);

comment on column public.family_events.invite_template is
  'The invitation''s design; null picks one from the event''s kind and title.';
comment on column public.family_events.invite_message is
  'A line for guests on the invitation and its share card. Shown through the invite link; notes never are.';

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

  select coalesce(timezone, 'UTC') into v_household_tz from public.households where id = v_row.household_id;
  v_household_tz := coalesce(v_household_tz, 'UTC');
  v_today := (now() at time zone v_household_tz)::date;

  select id into v_birthday_id from public.family_events
    where household_id = v_row.household_id and owner_member_id = v_row.id
      and kind = 'birthday' and external_id = 'member_birthday:' || v_row.id::text;

  if not v_removed and v_row.date_of_birth is not null then
    v_next := wh.next_occurrence(v_row.date_of_birth, v_today);
    if v_birthday_id is null then
      insert into public.family_events
        (household_id, title, kind, starts_at, ends_at, all_day, owner_member_id, status, external_id)
      values
        (v_row.household_id, v_row.display_name || '''s birthday', 'birthday',
         v_next::timestamp at time zone v_household_tz, (v_next + 1)::timestamp at time zone v_household_tz, true,
         v_row.id, 'confirmed', 'member_birthday:' || v_row.id::text);
    else
      update public.family_events
        set title = v_row.display_name || '''s birthday',
            starts_at = v_next::timestamp at time zone v_household_tz,
            ends_at = (v_next + 1)::timestamp at time zone v_household_tz,
            all_day = true
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
        (household_id, title, kind, starts_at, ends_at, all_day, owner_member_id, status, external_id)
      values
        (v_row.household_id, coalesce(v_row.special_occasion_label, v_row.display_name || '''s special day'),
         'special_occasion', v_next::timestamp at time zone v_household_tz, (v_next + 1)::timestamp at time zone v_household_tz, true,
         v_row.id, 'confirmed', 'member_special_occasion:' || v_row.id::text);
    else
      update public.family_events
        set title = coalesce(v_row.special_occasion_label, v_row.display_name || '''s special day'),
            starts_at = v_next::timestamp at time zone v_household_tz,
            ends_at = (v_next + 1)::timestamp at time zone v_household_tz,
            all_day = true
        where id = v_occasion_id;
    end if;
  elsif v_occasion_id is not null then
    delete from public.family_events where id = v_occasion_id;
  end if;

  return v_row;
end;
$$;

-- The rows already written: the UTC date they were stored on is the local
-- day they meant, so they move to that day's local midnight.
update public.family_events e
  set starts_at = ((e.starts_at at time zone 'UTC')::date)::timestamp at time zone coalesce(h.timezone, 'UTC'),
      ends_at = (((e.starts_at at time zone 'UTC')::date) + 1)::timestamp at time zone coalesce(h.timezone, 'UTC'),
      all_day = true
  from public.households h
  where h.id = e.household_id
    and e.external_id ~ '^member_(birthday|special_occasion):'
    and e.all_day = false;
