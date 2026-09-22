-- HomeSend Phase 1 (foundation slice of the approved HomeSend architecture):
-- undo for what routing actually wrote, and a real security check on
-- uploads (the bytes must match the claimed content type, not just the
-- filename/header). Reconciled with the v1 table shipped in
-- 20260921180000_home_send_items.sql rather than replacing it — the fuller
-- canonical-intake concepts (email routing addresses, multi-file
-- attachments, semantic dedupe) are deliberately deferred to the phases
-- that actually populate them; adding unused columns/tables now would be
-- dead schema nobody reads.

alter table public.home_send_items
  add column security_status text not null default 'not_applicable'
    check (security_status in ('not_applicable', 'clean', 'rejected'));

comment on column public.home_send_items.security_status is
  'File-content validation for manual_upload items: the bytes must actually match the claimed content type (a magic-byte check), not just the filename/MIME header. Pasted text has no file, so it stays not_applicable. A rejected upload is still stored in the private bucket for the record, but is never classified.';

-- A person can undo having sent something in, the same as any other add
-- (CLAUDE.md rule 12). "undone" sits alongside "routed" so a household can
-- tell an item was added and then taken back, rather than still reading it
-- as live.
alter table public.home_send_items drop constraint home_send_items_status_check;
alter table public.home_send_items add constraint home_send_items_status_check
  check (status in ('received', 'classified', 'routed', 'dismissed', 'undone'));

alter table public.home_send_items drop constraint home_send_items_routed_implies_status;
alter table public.home_send_items add constraint home_send_items_routed_implies_status
  check (routed_table is null or status in ('routed', 'undone'));

-- What routing an item actually wrote, so undo can call the same domain
-- service a manual remove would (cancelObligation / cancelSchoolItem /
-- retireConsumable) — never a raw delete, and never re-deriving which row
-- to reverse from routed_table/routed_id alone.
create table public.homesend_changes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  intake_id uuid not null references public.home_send_items(id) on delete cascade,
  domain text not null check (domain in ('bill', 'school_item', 'grocery_item')),
  entity_id uuid not null,
  created_by_member_id uuid not null references public.household_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by_member_id uuid references public.household_members(id) on delete set null,
  constraint homesend_changes_undo_consistency check ((undone_at is null) = (undone_by_member_id is null)),
  constraint homesend_changes_one_per_intake unique (intake_id)
);

comment on table public.homesend_changes is
  'The one domain write a routed HomeSend item produced. Undo reverses it through the same domain service a manual remove uses and marks this row undone -- the intake''s own status moves to "undone" alongside it, but routed_table/routed_id are kept, because what actually happened is never erased, only reversed.';

create index homesend_changes_household_idx on public.homesend_changes (household_id, created_at desc);

alter table public.homesend_changes enable row level security;

-- Same shared-inbox visibility as home_send_items itself: any member can see
-- what was written and any member can undo it.
create policy "homesend_changes_select_member"
  on public.homesend_changes for select
  to authenticated
  using (wh.is_member(household_id));

create policy "homesend_changes_insert_member"
  on public.homesend_changes for insert
  to authenticated
  with check (wh.is_member(household_id) and created_by_member_id = wh.member_id(household_id));

create policy "homesend_changes_update_member"
  on public.homesend_changes for update
  to authenticated
  using (wh.is_member(household_id) and undone_at is null)
  with check (
    wh.is_member(household_id)
    and (undone_by_member_id is null or undone_by_member_id = wh.member_id(household_id))
  );

notify pgrst, 'reload schema';
