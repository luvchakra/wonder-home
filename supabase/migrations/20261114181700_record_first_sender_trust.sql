-- Record first, phase 2 of "Nothing stuck in review" (the owner, 2026-11-14).
--
-- 1. Email from a new sender (decision 5). Until now mail from a sender no
--    Admin had added was dropped unread. Now the first item from a new
--    sender is kept, set aside (archived, reason 'new_sender', never read by a
--    model and with no attachments fetched) and the household is asked
--    "Trust this sender?" once. "Trust" adds the sender to the existing
--    allowlist (homesend_email_allowlist, 20261029093000) and the held items
--    are read; "Not ours" blocks it ('sender_blocked'); no answer in 3 days
--    sets them aside ('sender_not_answered'). A household on "Read only
--    senders an Admin added" keeps the old drop-before-storing behaviour.
--
-- 2. Proposals expire as not done after 48 hours with one reminder first;
--    the sweep looks for proposed actions by age, so it gets its own small
--    partial index.
--
-- Safe in either order: code that runs before this migration finds no
-- senders table and drops the mail as before; this migration only adds a
-- table, widens a check and adds an index.

create table if not exists public.homesend_email_senders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- Normalised, lower-cased bare address.
  address text not null check (length(address) between 3 and 320),
  state text not null default 'pending' check (state in ('pending', 'trusted', 'blocked', 'not_answered')),
  first_item_id uuid references public.home_send_items(id) on delete set null,
  held_count integer not null default 1 check (held_count >= 0),
  asked_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homesend_email_senders_unique unique (household_id, address)
);

comment on table public.homesend_email_senders is
  'Senders outside the household a HomeSend address heard from, and what the household said about them: pending (asked once), trusted (also on the allowlist), blocked ("Not ours"), not_answered (3 days). Written by the server only.';

create index if not exists homesend_email_senders_pending_idx on public.homesend_email_senders (asked_at) where state = 'pending';
create index if not exists homesend_email_senders_first_item_idx on public.homesend_email_senders (first_item_id);
create index if not exists homesend_email_senders_decided_by_idx on public.homesend_email_senders (decided_by_member_id);

alter table public.homesend_email_senders enable row level security;

-- Members see who wrote to the household; the server writes (the webhook and the answer, after its own Admin check).
drop policy if exists "homesend_email_senders_select_member" on public.homesend_email_senders;
create policy "homesend_email_senders_select_member"
  on public.homesend_email_senders for select
  to authenticated
  using (household_id in (select wh.member_households()));

revoke insert, update, delete on public.homesend_email_senders from anon, authenticated;

drop trigger if exists homesend_email_senders_set_updated_at on public.homesend_email_senders;
create trigger homesend_email_senders_set_updated_at
  before update on public.homesend_email_senders
  for each row execute function wh.set_updated_at();

alter table public.home_send_items drop constraint if exists home_send_items_archive_reason_check;
alter table public.home_send_items add constraint home_send_items_archive_reason_check
  check (archive_reason is null or archive_reason in ('untouched_30_days', 'past_date', 'already_recorded', 'superseded', 'cancelled', 'unreadable', 'removed_by_person',
                                                      'new_sender', 'sender_blocked', 'sender_not_answered'));

create index if not exists conversation_actions_proposed_age_idx
  on public.conversation_actions (created_at) where approval_status = 'proposed';

notify pgrst, 'reload schema';
