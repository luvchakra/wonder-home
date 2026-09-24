-- Smart notifications (module 23, stories 23-001 to 23-003).
--
-- A notification stops being a line of text and becomes a reminder about a
-- real thing: it names its source (the bill, the school item, the meal), its
-- category, and the window it may be delivered in, so the engine can
-- re-evaluate it when the household changes and cancel it when the thing is
-- done. Nothing here copies a domain record — a bill's amount and due date are
-- read from `obligations` when they are shown, never stored twice.
--
-- The recipient keeps exactly the control a person should have over their own
-- reminder — read it, act on it, dismiss it, snooze it forward — and loses the
-- ability they never should have had: rewriting its title, body or source.

-- 1. What a notification is about, and when it may be delivered.
alter table public.notifications
  add column category text not null default 'system'
    check (category in ('meals', 'school', 'groceries', 'bills', 'home', 'pets', 'appointments', 'family', 'system')),
  add column source_type text
    check (source_type in ('obligation', 'school_item', 'meal', 'grocery_list', 'pet_care_need', 'family_event',
                           'health_appointment', 'health_routine', 'health_checkup', 'approval', 'reminder')),
  add column source_id uuid,
  -- The window a reminder may land in. `scheduled_for` is the moment chosen
  -- inside it; `expires_at` is when it stops being worth showing at all.
  add column earliest_at timestamptz,
  add column latest_at timestamptz,
  add column expires_at timestamptz,
  add column reminder_policy text check (reminder_policy is null or reminder_policy ~ '^[a-z][a-z0-9_.]{1,60}$'),
  -- Which reminder of its policy this is (1 = the first). Bounded, so a policy
  -- can never escalate indefinitely.
  add column reminder_seq smallint not null default 1 check (reminder_seq between 1 and 10),
  add column snooze_count smallint not null default 0 check (snooze_count between 0 and 50),
  add column dismissed_at timestamptz,
  add constraint notifications_window_ordered check (
    (earliest_at is null or latest_at is null or earliest_at <= latest_at)
  ),
  -- A source names a record, except where there is no one row to name: the
  -- household's grocery list, a person's own HomeTalk reminder, and an
  -- approval (identified by its fingerprint in the thread key).
  add constraint notifications_source_complete check (
    (source_type is null and source_id is null)
    or source_type in ('grocery_list', 'reminder', 'approval')
    or (source_type is not null and source_id is not null)
  );

comment on column public.notifications.source_type is
  'The domain record this reminder is about. The record stays the source of truth; completing it resolves the reminder.';
comment on column public.notifications.reminder_seq is
  'Which reminder of the policy this row currently is. Escalation moves it forward, never past the policy''s maximum.';

alter table public.notifications drop constraint notifications_status_check;
alter table public.notifications add constraint notifications_status_check
  check (status in ('generated', 'delivered', 'seen', 'acted', 'resolved', 'expired', 'dismissed'));

create index notifications_source_idx
  on public.notifications (household_id, source_type, source_id)
  where status in ('generated', 'delivered', 'seen');

-- 2. The lifecycle leaves a trail in closed words.
alter table public.notification_events drop constraint notification_events_event_type_check;
alter table public.notification_events add constraint notification_events_event_type_check check (event_type in
  ('generated', 'sent', 'delivered', 'delivery_failed', 'seen', 'acted', 'resolved', 'expired', 'escalated',
   'suppressed', 'snoozed', 'dismissed', 'rescheduled'));

-- 3. A recipient changes state, never content.
--
-- Not SECURITY DEFINER on purpose: `current_user` must be the caller's role,
-- so the server (service role) and migrations keep full control while a
-- signed-in member is held to state changes on their own row.
create or replace function wh.guard_notification_recipient_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.household_id is distinct from old.household_id
    or new.recipient_member_id is distinct from old.recipient_member_id
    or new.type is distinct from old.type
    or new.priority is distinct from old.priority
    or new.thread_key is distinct from old.thread_key
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.action is distinct from old.action
    or new.outcome_id is distinct from old.outcome_id
    or new.decision_factors is distinct from old.decision_factors
    or new.category is distinct from old.category
    or new.source_type is distinct from old.source_type
    or new.source_id is distinct from old.source_id
    or new.earliest_at is distinct from old.earliest_at
    or new.latest_at is distinct from old.latest_at
    or new.expires_at is distinct from old.expires_at
    or new.reminder_policy is distinct from old.reminder_policy
    or new.reminder_seq is distinct from old.reminder_seq
    or new.created_at is distinct from old.created_at
    or new.delivered_at is distinct from old.delivered_at
  then
    raise exception 'A reminder''s content belongs to WonderHome; you can act on it, dismiss it or snooze it.'
      using errcode = 'insufficient_privilege';
  end if;

  -- A snooze: back to waiting, later than now, no further than a month out,
  -- counted once.
  if new.scheduled_for is distinct from old.scheduled_for or new.snooze_count is distinct from old.snooze_count then
    if new.status <> 'generated'
      or new.scheduled_for <= now()
      or new.scheduled_for > now() + interval '31 days'
      or new.snooze_count <> old.snooze_count + 1
      or old.status not in ('generated', 'delivered', 'seen')
    then
      raise exception 'A reminder can only be snoozed forward, up to a month.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status and new.status not in ('seen', 'acted', 'resolved', 'dismissed') then
    raise exception 'That is not a change a person makes to a reminder.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger notifications_guard_recipient_update
  before update on public.notifications
  for each row execute function wh.guard_notification_recipient_update();

-- 4. Every change of state is recorded, whoever made it. Security definer so a
--    member's own snooze or dismissal is kept even though they cannot write
--    the event table themselves.
create or replace function wh.log_notification_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text;
begin
  if tg_op = 'INSERT' then
    kind := 'generated';
  elsif new.snooze_count > old.snooze_count then
    kind := 'snoozed';
  elsif new.reminder_seq > old.reminder_seq then
    kind := 'escalated';
  elsif new.status is distinct from old.status then
    kind := case new.status
      when 'seen' then 'seen'
      when 'acted' then 'acted'
      when 'resolved' then 'resolved'
      when 'expired' then 'expired'
      when 'dismissed' then 'dismissed'
      when 'delivered' then 'delivered'
      else 'rescheduled'
    end;
  elsif new.scheduled_for is distinct from old.scheduled_for then
    kind := 'rescheduled';
  else
    return new;
  end if;

  insert into public.notification_events (household_id, notification_id, event_type, channel, metadata)
  values (new.household_id, new.id, kind, 'in_app',
          jsonb_build_object('status', new.status, 'reminderSeq', new.reminder_seq, 'scheduledFor', new.scheduled_for));
  return new;
end;
$$;

create trigger notifications_log_transition
  after insert or update on public.notifications
  for each row execute function wh.log_notification_transition();

-- 5. Quiet hours to the minute ("10:30 PM"), in the household's own time zone.
alter table public.notification_preferences
  add column quiet_from_minute smallint not null default 0 check (quiet_from_minute between 0 and 59),
  add column quiet_until_minute smallint not null default 0 check (quiet_until_minute between 0 and 59);

comment on column public.notification_preferences.quiet_from is
  'Hour quiet begins, in the household''s time zone (never UTC). quiet_from_minute adds the minutes.';

-- 6. How early each kind of reminder should come, per person. A preset from a
--    closed list per category; the engine owns what each preset means.
create table public.reminder_preferences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.household_members (id) on delete cascade,
  category text not null check (category in ('meals', 'school', 'groceries', 'bills', 'home', 'pets', 'appointments', 'family')),
  preset text not null check (preset ~ '^[a-z][a-z0-9_]{1,40}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, category)
);

comment on table public.reminder_preferences is
  'A person''s own reminder timing per category. Never written by AI; the engine reads it and falls back to the policy default.';

create trigger reminder_preferences_set_updated_at
  before update on public.reminder_preferences
  for each row execute function wh.set_updated_at();

alter table public.reminder_preferences enable row level security;

create policy reminder_preferences_select_own
  on public.reminder_preferences for select
  to authenticated
  using (member_id = wh.member_id(household_id) or wh.is_household_admin(household_id));

create policy reminder_preferences_write_own
  on public.reminder_preferences for all
  to authenticated
  using (member_id = wh.member_id(household_id))
  with check (member_id = wh.member_id(household_id));

-- 7. When a household's reminders were last reconciled against its records,
--    so opening the app re-evaluates them without doing it on every page.
create table public.notification_reconciliations (
  household_id uuid primary key references public.households (id) on delete cascade,
  reconciled_at timestamptz not null default now()
);

comment on table public.notification_reconciliations is
  'Server-only throttle for reminder reconciliation. A deny-all policy: only the service role reads or writes it.';

alter table public.notification_reconciliations enable row level security;

-- No session reads or writes it: only the service role, which bypasses RLS.
create policy notification_reconciliations_no_client_access
  on public.notification_reconciliations for all
  to anon, authenticated
  using (false)
  with check (false);

notify pgrst, 'reload schema';
