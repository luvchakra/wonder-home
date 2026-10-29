-- HomeSend email sender allowlist (story 17-016): the privacy gate for email
-- intake. WonderHome reads and keeps mail only from senders a household has
-- approved; everything else is dropped by the inbound webhook before it is
-- ever stored. This table is the one source of that decision.
--
-- An entry is either an exact address ('bills@bescom.co.in') or a whole
-- domain ('school.edu', stored without the leading '@'). Entries are
-- immutable: a household adds and removes them, never edits one in place, so
-- the audit trail (homesend.allowlist_added / _removed) reads cleanly.
--
-- Default empty = nothing is read. A household with no rows has approved no
-- sender, so the webhook keeps nothing until an Admin adds one. This matters
-- for ordering safety: the code that reads this table (the webhook gate) is
-- shipping with it, and treats "no rows" as "allow no one", so there is no
-- window in which mail flows before a sender is approved.

create table public.homesend_email_allowlist (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('address', 'domain')),
  -- Normalized, lower-cased by the application: a full address for 'address',
  -- a bare domain (no '@') for 'domain'. Bounded to a real address length.
  value text not null check (length(value) between 3 and 320),
  created_at timestamptz not null default now(),
  created_by_member_id uuid references public.household_members(id) on delete set null,
  constraint homesend_email_allowlist_unique unique (household_id, kind, value)
);

comment on table public.homesend_email_allowlist is
  'Approved email senders per household. The inbound email webhook reads mail only from a sender that matches a row here, and drops everything else before storing it. Empty means nothing is read.';

-- The unique index on (household_id, kind, value) already serves the webhook
-- lookup and the member read, both of which filter by household_id as the
-- leading column. The one foreign key that is not that leading column gets
-- its own index (CLAUDE.md: index every new foreign key).
create index homesend_email_allowlist_created_by_idx
  on public.homesend_email_allowlist (created_by_member_id);

alter table public.homesend_email_allowlist enable row level security;

-- Every member may read the approved senders (set form, per CLAUDE.md —
-- never a per-row helper). Only an Admin adds or removes one, the same shape
-- as the household's forwarding address.
create policy "homesend_email_allowlist_select_member"
  on public.homesend_email_allowlist for select
  to authenticated
  using (household_id in (select wh.member_households()));

create policy "homesend_email_allowlist_insert_admin"
  on public.homesend_email_allowlist for insert
  to authenticated
  with check (household_id in (select wh.admin_households()));

create policy "homesend_email_allowlist_delete_admin"
  on public.homesend_email_allowlist for delete
  to authenticated
  using (household_id in (select wh.admin_households()));

notify pgrst, 'reload schema';
