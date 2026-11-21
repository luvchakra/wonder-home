-- 11-021: a bill opens to its full detail, with photos or PDFs of the bill
-- or its receipt attached (the owner, 2026-11-21).
--
-- Files live in the existing private `home-send` bucket under
-- <household>/bills/<bill>/<id>, the bucket's household-folder policies
-- already scoping them. This table is the record of what is attached. A file
-- is taken off with removed_at, never deleted (rule 12). New table only, so
-- the code runs before or after it: reads fall back to none, and attaching
-- says it isn't switched on yet. Who may edit a bill (an Admin) may attach.

create table if not exists public.bill_attachments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  obligation_id uuid not null references public.obligations(id) on delete cascade,
  file_path text not null check (length(file_path) between 1 and 300),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  filename text check (filename is null or length(filename) between 1 and 200),
  byte_size integer not null check (byte_size > 0),
  uploaded_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by_member_id uuid references public.household_members(id) on delete set null
);

comment on table public.bill_attachments is
  'Photos or PDFs of a bill or its receipt, attached on the bill''s full record (11-021). Files are in the home-send bucket.';

-- Foreign keys are indexed (the performance rule); the bill one is what the record reads by.
create index if not exists bill_attachments_obligation_id_idx on public.bill_attachments (obligation_id, created_at desc);
create index if not exists bill_attachments_household_id_idx on public.bill_attachments (household_id);
create index if not exists bill_attachments_uploaded_by_member_id_idx on public.bill_attachments (uploaded_by_member_id);
create index if not exists bill_attachments_removed_by_member_id_idx on public.bill_attachments (removed_by_member_id);

alter table public.bill_attachments enable row level security;

drop policy if exists bill_attachments_select on public.bill_attachments;
create policy bill_attachments_select on public.bill_attachments for select
  to authenticated
  using (household_id in (select wh.member_households()));

drop policy if exists bill_attachments_insert on public.bill_attachments;
create policy bill_attachments_insert on public.bill_attachments for insert
  to authenticated
  with check (household_id in (select wh.admin_households()));

drop policy if exists bill_attachments_update on public.bill_attachments;
create policy bill_attachments_update on public.bill_attachments for update
  to authenticated
  using (household_id in (select wh.admin_households()))
  with check (household_id in (select wh.admin_households()));

grant select, insert, update on public.bill_attachments to authenticated;

notify pgrst, 'reload schema';

-- A bill's record reads its own trail by target (11-021): index what it filters on.
create index if not exists audit_events_household_target_idx
  on public.audit_events (household_id, target_id, created_at desc)
  where target_id is not null;
