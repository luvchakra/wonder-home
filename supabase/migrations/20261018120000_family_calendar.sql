-- Family Calendar foundation (story 12-009, design/FAMILY-CALENDAR-PHASE0.md §3.2,
-- decisions D1–D7 approved 2026-10-18).
--
-- The calendar is a projection: it never copies a record. This migration only
-- gives family events what a calendar needs of them (all-day, a time zone, a
-- category, who may see them, a small repeat rule and single-occurrence
-- exceptions), adds a read-only table of sourced public holidays and a
-- per-member preferences row, and puts family events on every plan (D2).
--
-- Visibility (D5) is enforced here, never only in the UI:
--   household    — everyone in the household, as before (the default);
--   participants — the owner and the people invited;
--   private      — the owner alone.
-- An Admin does not bypass `private`, matching health.
--
-- Everything is additive and nullable or defaulted. Rollback: drop the new
-- tables and columns and restore the select/update/delete policies from
-- 20260917165018 and 20261017190000.

-- ---------------------------------------------------------------------------
-- Repeat rules: a small, validated subset
-- ---------------------------------------------------------------------------

create or replace function wh.valid_recurrence(rule jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select rule is null or coalesce((
    jsonb_typeof(rule) = 'object'
    and (select bool_and(k in ('freq', 'interval', 'byWeekday', 'until', 'count')) from jsonb_object_keys(rule) k)
    and rule->>'freq' in ('daily', 'weekly', 'monthly', 'yearly')
    and (not rule ? 'interval' or (jsonb_typeof(rule->'interval') = 'number' and (rule->>'interval')::numeric between 1 and 99 and (rule->>'interval')::numeric = floor((rule->>'interval')::numeric)))
    and (not rule ? 'count' or (jsonb_typeof(rule->'count') = 'number' and (rule->>'count')::numeric between 1 and 500 and (rule->>'count')::numeric = floor((rule->>'count')::numeric)))
    and (not rule ? 'until' or (jsonb_typeof(rule->'until') = 'string' and rule->>'until' ~ '^\d{4}-\d{2}-\d{2}$'))
    and not (rule ? 'until' and rule ? 'count')
    and (not rule ? 'byWeekday' or (
      rule->>'freq' = 'weekly'
      and jsonb_typeof(rule->'byWeekday') = 'array'
      and jsonb_array_length(rule->'byWeekday') between 1 and 7
      and (select bool_and(jsonb_typeof(d) = 'number' and d::text in ('0', '1', '2', '3', '4', '5', '6')) from jsonb_array_elements(rule->'byWeekday') d)
    ))
  ), false);
$$;

comment on function wh.valid_recurrence(jsonb) is
  'A family event''s repeat rule: freq daily/weekly/monthly/yearly, interval 1–99, weekly byWeekday 0–6 (Sunday = 0), and either until (a local date) or count (1–500), never both.';

-- ---------------------------------------------------------------------------
-- family_events: what a calendar needs
-- ---------------------------------------------------------------------------

alter table public.family_events
  add column all_day boolean not null default false,
  add column timezone text check (timezone is null or length(timezone) between 1 and 64),
  add column category text check (category is null or category in ('family', 'school', 'meals', 'health', 'personal', 'work', 'household')),
  add column visibility text not null default 'household' check (visibility in ('household', 'participants', 'private')),
  add column recurrence jsonb check (wh.valid_recurrence(recurrence)),
  -- An event visible to fewer than the household is somebody's, so there is
  -- always a person who can see it and change it.
  add constraint family_events_restricted_has_owner check (visibility = 'household' or owner_member_id is not null);

comment on column public.family_events.all_day is
  'An all-day event runs from local midnight to the following local midnight(s) in its time zone.';
comment on column public.family_events.timezone is
  'IANA zone the event''s local times are in; null means the household''s.';
comment on column public.family_events.visibility is
  'household (everyone), participants (owner and invited members), private (owner only; Admins do not bypass).';
comment on column public.family_events.recurrence is
  'Repeat rule, validated by wh.valid_recurrence. Occurrences are expanded per requested range, never stored.';

create index family_events_recurring_idx on public.family_events (household_id, starts_at)
  where recurrence is not null and status <> 'cancelled';

-- Whether the signed-in person is invited to an event. SECURITY DEFINER so the
-- family_events policy can ask without recursing through event_participants'
-- own policy, which reads family_events.
create or replace function wh.is_event_participant(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_participants ep
    where ep.event_id = p_event_id
      and ep.member_id = wh.member_id(ep.household_id)
  );
$$;

-- Whether the signed-in person may see an event: the one rule every table
-- hanging off an event (participants, links, guests, exceptions) reuses.
create or replace function wh.may_see_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.family_events e
    where e.id = p_event_id
      and wh.is_member(e.household_id)
      and (
        e.visibility = 'household'
        or e.owner_member_id = wh.member_id(e.household_id)
        or (e.visibility = 'participants' and wh.is_event_participant(e.id))
      )
  );
$$;

-- Whether the signed-in person may change an event: they can see it, and it is
-- theirs, nobody's, or they are an Admin (as family_events_update_owner).
create or replace function wh.may_edit_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select wh.may_see_event(p_event_id) and exists (
    select 1 from public.family_events e
    where e.id = p_event_id
      and (e.owner_member_id is null
        or e.owner_member_id = wh.member_id(e.household_id)
        or wh.is_household_admin(e.household_id))
  );
$$;

revoke all on function wh.is_event_participant(uuid) from public;
revoke all on function wh.may_see_event(uuid) from public;
revoke all on function wh.may_edit_event(uuid) from public;
grant execute on function wh.is_event_participant(uuid) to authenticated;
grant execute on function wh.may_see_event(uuid) to authenticated;
grant execute on function wh.may_edit_event(uuid) to authenticated;

drop policy family_events_select_member on public.family_events;
create policy family_events_select_visible on public.family_events for select
  to authenticated
  using (
    wh.is_member(household_id)
    and (
      visibility = 'household'
      or owner_member_id = wh.member_id(household_id)
      or (visibility = 'participants' and wh.is_event_participant(id))
    )
  );

-- Only the owner can make an event narrower than the household, so nobody
-- hides something in someone else's name.
drop policy family_events_insert_member on public.family_events;
create policy family_events_insert_member on public.family_events for insert
  to authenticated
  with check (
    wh.is_member(household_id)
    and (visibility = 'household' or owner_member_id = wh.member_id(household_id))
  );

drop policy family_events_update_owner on public.family_events;
create policy family_events_update_owner on public.family_events for update
  to authenticated
  using (
    wh.is_member(household_id)
    and (visibility = 'household' or owner_member_id = wh.member_id(household_id)
      or (visibility = 'participants' and wh.is_event_participant(id)))
    and (owner_member_id is null or owner_member_id = wh.member_id(household_id) or wh.is_household_admin(household_id))
  )
  with check (
    wh.is_member(household_id)
    and (owner_member_id is null or owner_member_id = wh.member_id(household_id) or wh.is_household_admin(household_id))
    and (visibility = 'household' or owner_member_id = wh.member_id(household_id))
  );

drop policy family_events_delete_owner on public.family_events;
create policy family_events_delete_owner on public.family_events for delete
  to authenticated
  using (
    wh.is_member(household_id)
    and (owner_member_id = wh.member_id(household_id)
      or (wh.is_household_admin(household_id) and visibility = 'household'))
  );

-- Who is invited, an event's link and its guests' replies are only as visible
-- as the event itself.
drop policy event_participants_select_member on public.event_participants;
create policy event_participants_select_member on public.event_participants for select
  to authenticated using (wh.is_member(household_id) and wh.may_see_event(event_id));

-- The write policies on event_participants are FOR ALL, so they grant reads
-- too (an Admin's included). Restrictive, so every read and write of who is
-- invited also needs the event itself to be visible.
create policy event_participants_event_visible on public.event_participants
  as restrictive for all
  to authenticated
  using (wh.may_see_event(event_id))
  with check (wh.may_see_event(event_id));

drop policy event_invite_links_select_member on public.event_invite_links;
create policy event_invite_links_select_member on public.event_invite_links for select
  to authenticated using (wh.is_member(household_id) and wh.may_see_event(event_id));

drop policy event_invite_links_update_member on public.event_invite_links;
create policy event_invite_links_update_member on public.event_invite_links for update
  to authenticated
  using (wh.is_member(household_id) and wh.may_see_event(event_id))
  with check (wh.is_member(household_id) and wh.may_see_event(event_id));

drop policy event_invite_links_insert_member on public.event_invite_links;
create policy event_invite_links_insert_member on public.event_invite_links for insert
  to authenticated
  with check (
    wh.is_member(household_id)
    and (created_by_member_id is null or created_by_member_id = wh.member_id(household_id))
    and wh.may_see_event(event_id)
    and exists (select 1 from public.family_events e where e.id = event_id and e.household_id = event_invite_links.household_id)
  );

drop policy event_guests_select_member on public.event_guests;
create policy event_guests_select_member on public.event_guests for select
  to authenticated using (wh.is_member(household_id) and wh.may_see_event(event_id));

drop policy event_guests_delete_member on public.event_guests;
create policy event_guests_delete_member on public.event_guests for delete
  to authenticated using (wh.is_member(household_id) and wh.may_see_event(event_id));

-- ---------------------------------------------------------------------------
-- event_exceptions: one occurrence of a repeating event, moved or cancelled
-- ---------------------------------------------------------------------------

create table public.event_exceptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  event_id uuid not null references public.family_events(id) on delete cascade,
  -- The local date the occurrence would have had under the rule.
  occurrence_date date not null,
  cancelled boolean not null default false,
  title text check (title is null or length(trim(title)) between 1 and 200),
  starts_at timestamptz,
  ends_at timestamptz,
  location text check (location is null or length(trim(location)) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, occurrence_date),
  constraint event_exceptions_times_together check ((starts_at is null) = (ends_at is null)),
  constraint event_exceptions_ordered check (starts_at is null or starts_at < ends_at)
);

comment on table public.event_exceptions is
  'One occurrence of a repeating family event, cancelled or changed. As visible and as editable as its event.';

create trigger event_exceptions_set_updated_at
  before update on public.event_exceptions
  for each row execute function wh.set_updated_at();

alter table public.event_exceptions enable row level security;

create policy event_exceptions_select_visible on public.event_exceptions for select
  to authenticated using (wh.is_member(household_id) and wh.may_see_event(event_id));

create policy event_exceptions_write_editor on public.event_exceptions for all
  to authenticated
  using (wh.is_member(household_id) and wh.may_edit_event(event_id))
  with check (
    wh.is_member(household_id)
    and wh.may_edit_event(event_id)
    and exists (select 1 from public.family_events e where e.id = event_id and e.household_id = event_exceptions.household_id and e.recurrence is not null)
  );

-- ---------------------------------------------------------------------------
-- public_holidays: a curated, sourced, read-only list (D3)
-- ---------------------------------------------------------------------------

create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  -- ISO 3166-1 country, and an ISO 3166-2 subdivision when the holiday is
  -- only observed there (null: the whole country).
  region text not null check (region ~ '^[A-Z]{2}$'),
  subregion text check (subregion is null or subregion ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'),
  on_date date not null,
  name text not null check (length(trim(name)) between 1 and 120),
  kind text not null default 'gazetted' check (kind in ('gazetted', 'restricted', 'observance')),
  -- Where the date comes from, shown beside it: never a date with no source.
  source text not null check (length(trim(source)) between 1 and 300),
  source_version text not null check (length(trim(source_version)) between 1 and 40),
  created_at timestamptz not null default now()
);

comment on table public.public_holidays is
  'Public holidays from a named official source, seeded by migration. Read-only to every session.';

create unique index public_holidays_identity on public.public_holidays (region, coalesce(subregion, ''), on_date, name);
create index public_holidays_range on public.public_holidays (region, on_date);

alter table public.public_holidays enable row level security;

create policy public_holidays_select_all on public.public_holidays for select
  to authenticated using (true);

revoke insert, update, delete on public.public_holidays from authenticated, anon;

-- Government of India, DoP&T: holidays observed in Central Government
-- administrative offices. Fourteen are compulsory for every office in India
-- (region IN). Delhi/New Delhi offices add three chosen from the optional list
-- (IN-DL: Holi, Ram Navami, Janmashtami); offices elsewhere choose their own
-- three, which this list does not guess.
insert into public.public_holidays (region, subregion, on_date, name, kind, source, source_version) values
  -- 2026: O.M. F.No.12/2/2023-JCA dated 03.07.2025; Id-ul-Zuha moved from 27 to
  -- 28 May by DoP&T O.M. dated 22.05.2026.
  ('IN', null,    '2026-01-26', 'Republic Day', 'gazetted', 'Government of India, DoP&T holiday list 2026', 'dopt-2026-r1'),
  ('IN', 'IN-DL', '2026-03-04', 'Holi', 'gazetted', 'Government of India, DoP&T holiday list 2026 (Delhi)', 'dopt-2026-r1'),
  ('IN', null,    '2026-03-21', 'Id-ul-Fitr', 'gazetted', 'Government of India, DoP&T holiday list 2026', 'dopt-2026-r1'),
  ('IN', 'IN-DL', '2026-03-26', 'Ram Navami', 'gazetted', 'Government of India, DoP&T holiday list 2026 (Delhi)', 'dopt-2026-r1'),
  ('IN', null,    '2026-03-31', 'Mahavir Jayanti', 'gazetted', 'Government of India, DoP&T holiday list 2026', 'dopt-2026-r1'),
  ('IN', null,    '2026-04-03', 'Good Friday', 'gazetted', 'Government of India, DoP&T holiday list 2026', 'dopt-2026-r1'),
  ('IN', null,    '2026-05-01', 'Buddha Purnima', 'gazetted', 'Government of India, DoP&T holiday list 2026', 'dopt-2026-r1'),
  ('IN', null,    '2026-05-28', 'Id-ul-Zuha (Bakrid)', 'gazetted', 'Government of India, DoP&T holiday list 2026, as changed 22 May 2026', 'dopt-2026-r1'),
  ('IN', null,    '2026-06-26', 'Muharram', 'gazetted', 'Government of India, DoP&T holiday list 2026', 'dopt-2026-r1'),
  ('IN', null,    '2026-08-15', 'Independence Day', 'gazetted', 'Government of India, DoP&T holiday list 2026', 'dopt-2026-r1'),
  ('IN', null,    '2026-08-26', 'Milad-un-Nabi', 'gazetted', 'Government of India, DoP&T holiday list 2026', 'dopt-2026-r1'),
  ('IN', 'IN-DL', '2026-09-04', 'Janmashtami', 'gazetted', 'Government of India, DoP&T holiday list 2026 (Delhi)', 'dopt-2026-r1'),
  ('IN', null,    '2026-10-02', 'Mahatma Gandhi''s Birthday', 'gazetted', 'Government of India, DoP&T holiday list 2026', 'dopt-2026-r1'),
  ('IN', null,    '2026-10-20', 'Dussehra', 'gazetted', 'Government of India, DoP&T holiday list 2026', 'dopt-2026-r1'),
  ('IN', null,    '2026-11-08', 'Diwali', 'gazetted', 'Government of India, DoP&T holiday list 2026', 'dopt-2026-r1'),
  ('IN', null,    '2026-11-24', 'Guru Nanak''s Birthday', 'gazetted', 'Government of India, DoP&T holiday list 2026', 'dopt-2026-r1'),
  ('IN', null,    '2026-12-25', 'Christmas Day', 'gazetted', 'Government of India, DoP&T holiday list 2026', 'dopt-2026-r1'),
  -- 2027: O.M. F.No.12/2/2023-JCA dated 16.07.2026. Dates of Islamic festivals
  -- depend on the moon and may be changed by a later O.M.
  ('IN', null,    '2027-01-26', 'Republic Day', 'gazetted', 'Government of India, DoP&T holiday list 2027', 'dopt-2027'),
  ('IN', null,    '2027-03-10', 'Id-ul-Fitr', 'gazetted', 'Government of India, DoP&T holiday list 2027', 'dopt-2027'),
  ('IN', 'IN-DL', '2027-03-23', 'Holi', 'gazetted', 'Government of India, DoP&T holiday list 2027 (Delhi)', 'dopt-2027'),
  ('IN', null,    '2027-03-26', 'Good Friday', 'gazetted', 'Government of India, DoP&T holiday list 2027', 'dopt-2027'),
  ('IN', 'IN-DL', '2027-04-15', 'Ram Navami', 'gazetted', 'Government of India, DoP&T holiday list 2027 (Delhi)', 'dopt-2027'),
  ('IN', null,    '2027-04-19', 'Mahavir Jayanti', 'gazetted', 'Government of India, DoP&T holiday list 2027', 'dopt-2027'),
  ('IN', null,    '2027-05-17', 'Id-ul-Zuha (Bakrid)', 'gazetted', 'Government of India, DoP&T holiday list 2027', 'dopt-2027'),
  ('IN', null,    '2027-05-20', 'Buddha Purnima', 'gazetted', 'Government of India, DoP&T holiday list 2027', 'dopt-2027'),
  ('IN', null,    '2027-06-16', 'Muharram', 'gazetted', 'Government of India, DoP&T holiday list 2027', 'dopt-2027'),
  ('IN', null,    '2027-08-15', 'Independence Day', 'gazetted', 'Government of India, DoP&T holiday list 2027', 'dopt-2027'),
  ('IN', null,    '2027-08-15', 'Milad-un-Nabi', 'gazetted', 'Government of India, DoP&T holiday list 2027', 'dopt-2027'),
  ('IN', 'IN-DL', '2027-08-25', 'Janmashtami', 'gazetted', 'Government of India, DoP&T holiday list 2027 (Delhi)', 'dopt-2027'),
  ('IN', null,    '2027-10-02', 'Mahatma Gandhi''s Birthday', 'gazetted', 'Government of India, DoP&T holiday list 2027', 'dopt-2027'),
  ('IN', null,    '2027-10-09', 'Dussehra', 'gazetted', 'Government of India, DoP&T holiday list 2027', 'dopt-2027'),
  ('IN', null,    '2027-10-29', 'Diwali', 'gazetted', 'Government of India, DoP&T holiday list 2027', 'dopt-2027'),
  ('IN', null,    '2027-11-14', 'Guru Nanak''s Birthday', 'gazetted', 'Government of India, DoP&T holiday list 2027', 'dopt-2027'),
  ('IN', null,    '2027-12-25', 'Christmas Day', 'gazetted', 'Government of India, DoP&T holiday list 2027', 'dopt-2027')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- calendar_preferences: how one person likes to see the calendar
-- ---------------------------------------------------------------------------

create table public.calendar_preferences (
  member_id uuid primary key references public.household_members(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  default_view text not null default 'month' check (default_view in ('month', 'week', 'day', 'year')),
  -- Which sources and categories are shown; validated by the app.
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object' and length(filters::text) <= 4000),
  -- 'IN' or 'IN-DL'; null means the household's region; 'off' hides holidays.
  holiday_region text check (holiday_region is null or holiday_region = 'off' or holiday_region ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'),
  updated_at timestamptz not null default now()
);

comment on table public.calendar_preferences is
  'One member''s calendar view, filters and holiday region. Only that member reads or writes it.';

create trigger calendar_preferences_set_updated_at
  before update on public.calendar_preferences
  for each row execute function wh.set_updated_at();

alter table public.calendar_preferences enable row level security;

create policy calendar_preferences_own on public.calendar_preferences for all
  to authenticated
  using (member_id = wh.member_id(household_id))
  with check (member_id = wh.member_id(household_id));

-- ---------------------------------------------------------------------------
-- Family events on every plan (D2)
-- ---------------------------------------------------------------------------

insert into public.plan_features (plan_key, feature_key, enabled, limit_per_period, period)
select key, 'family.events', true, null, 'forever' from public.plans
on conflict (plan_key, feature_key) do update set enabled = true, limit_per_period = null, period = 'forever';

notify pgrst, 'reload schema';
