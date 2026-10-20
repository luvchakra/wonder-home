-- Which channels carry which kind of reminder (story 27-002, the owner, 2026-10-20).
--
-- A person already switches a channel on or off as a whole (`notification_preferences`).
-- This adds the finer choice: "bills by WhatsApp, school by push, the rest in the
-- app". Everything is allowed until a person says otherwise, so only the
-- exceptions are stored: one row is one kind of reminder kept off one channel.
-- A new kind of reminder, or a new channel, needs no row and no migration.
--
-- The in-app list is always the record and cannot be muted. A critical alert
-- ignores a mute in the delivery code, because the one thing a person must not
-- miss is not theirs to route away by accident.
--
-- A mute is the member's own: they read and change only theirs.

create table public.notification_channel_mutes (
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  category text not null check (category in ('meals', 'school', 'groceries', 'bills', 'home', 'pets', 'appointments', 'family', 'system')),
  channel text not null check (channel in ('push', 'email', 'whatsapp')),
  created_at timestamptz not null default now(),
  primary key (member_id, category, channel)
);

comment on table public.notification_channel_mutes is
  'One row is one kind of reminder kept off one channel for one member. No row means allowed. In-app cannot be muted; a critical alert ignores a mute.';

create index notification_channel_mutes_household_idx on public.notification_channel_mutes (household_id);

alter table public.notification_channel_mutes enable row level security;

grant select, insert, delete on public.notification_channel_mutes to authenticated;

create policy notification_channel_mutes_own on public.notification_channel_mutes for all to authenticated
  using ((household_id, member_id) in (select household_id, member_id from wh.my_memberships()))
  with check ((household_id, member_id) in (select household_id, member_id from wh.my_memberships()));

notify pgrst, 'reload schema';
