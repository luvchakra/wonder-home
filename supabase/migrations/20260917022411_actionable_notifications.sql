-- Actionable notifications (stories 06-001 through 06-007).
--
-- Applied to the wonder-home Supabase project as version 20260917022411.
--
-- The schema encodes the product rule that the decision engine enforces: a
-- notification names one recipient, carries a reason, and offers something that
-- person can actually do. Broadcasts are not representable — recipient_member_id
-- is a single member, not a list — because telling everybody is how a household
-- learns to ignore notifications, and it means nobody is accountable.

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'push', 'email', 'whatsapp')),
  enabled boolean not null default true,
  -- Hours in the member's own timezone. May wrap midnight, which is the normal case.
  quiet_from smallint check (quiet_from between 0 and 23),
  quiet_until smallint check (quiet_until between 0 and 23),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, channel)
);

comment on table public.notification_preferences is
  'Per-member delivery preferences and quiet hours. Quiet hours may wrap midnight.';

alter table public.notification_preferences enable row level security;

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function wh.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipient_member_id uuid not null references public.household_members(id) on delete cascade,
  type text not null check (type in ('action', 'decision', 'risk', 'completion')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  -- Stable identity for the situation, so an evolving problem stays one thread
  -- rather than becoming an alert storm.
  thread_key text not null,
  title text not null check (length(trim(title)) between 1 and 160),
  body text not null check (length(trim(body)) between 1 and 500),
  action jsonb,
  outcome_id uuid references public.outcomes(id) on delete cascade,
  status text not null default 'generated'
    check (status in ('generated', 'delivered', 'seen', 'acted', 'resolved', 'expired')),
  -- Why this was sent. Kept so a decision can be explained to a household that
  -- asks why it was interrupted, and debugged when it should not have been.
  decision_factors jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null default now(),
  delivered_at timestamptz,
  seen_at timestamptz,
  acted_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notifications is
  'An interruption that earned its place: a specific recipient, a reason, and something they can do.';

alter table public.notifications enable row level security;

create index notifications_recipient_open_idx on public.notifications (recipient_member_id, scheduled_for)
  where status in ('generated', 'delivered', 'seen');

-- One open notification per thread per person. This is what makes "no alert
-- storms" structural: a re-detected problem updates the existing row.
create unique index notifications_one_open_per_thread
  on public.notifications (household_id, recipient_member_id, thread_key)
  where status in ('generated', 'delivered', 'seen');

create trigger notifications_set_updated_at
  before update on public.notifications
  for each row execute function wh.set_updated_at();

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  event_type text not null check (event_type in
    ('generated', 'delivered', 'seen', 'acted', 'resolved', 'expired', 'escalated', 'suppressed')),
  channel text check (channel in ('in_app', 'push', 'email', 'whatsapp')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.notification_events is
  'The lifecycle of one notification, including the times it was deliberately suppressed.';

alter table public.notification_events enable row level security;

create index notification_events_notification_idx on public.notification_events (notification_id, created_at);

create or replace function wh.assert_notification_recipient_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select household_id into v_household from public.household_members where id = new.recipient_member_id;
  if v_household is distinct from new.household_id then
    raise exception 'Recipient % is not part of household %', new.recipient_member_id, new.household_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger notifications_recipient_valid
  before insert or update on public.notifications
  for each row execute function wh.assert_notification_recipient_in_household();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- A notification is addressed to one person and only that person reads it —
-- not other members, not administrators. Being able to see what WonderHome
-- told your partner is a privacy problem, not an admin feature.
--
-- The recipient may update their own (to mark it seen or acted); creation is
-- server-side only, so nothing can manufacture an interruption.
-- ---------------------------------------------------------------------------

create policy notifications_select_own on public.notifications for select
  to authenticated using (recipient_member_id = wh.member_id(household_id));

create policy notifications_update_own on public.notifications for update
  to authenticated
  using (recipient_member_id = wh.member_id(household_id))
  with check (recipient_member_id = wh.member_id(household_id));

create policy notification_events_select_own on public.notification_events for select
  to authenticated
  using (exists (
    select 1 from public.notifications n
    where n.id = notification_id and n.recipient_member_id = wh.member_id(n.household_id)
  ));

create policy notification_preferences_select_own on public.notification_preferences for select
  to authenticated
  using (member_id = wh.member_id(household_id) or wh.is_household_admin(household_id));

create policy notification_preferences_write_own on public.notification_preferences for all
  to authenticated
  using (member_id = wh.member_id(household_id))
  with check (member_id = wh.member_id(household_id));

notify pgrst, 'reload schema';
