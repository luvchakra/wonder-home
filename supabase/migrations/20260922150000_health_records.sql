-- Health & Fitness: health records & HomeSend intake (story 21-005).
--
-- `health_records` stores a household document against exactly one member --
-- a lab result, a prescription, a discharge summary -- with the same
-- self-or-guardian-only RLS shape every earlier health entity uses. Its own
-- storage (a dedicated `health-records` bucket, distinct from HomeSend's
-- `home-send` bucket) is privacy-scoped through `wh.may_see_health()` at the
-- object level, not just household membership: a household document can
-- carry another adult's private health content, and HomeSend's own
-- `home-send` bucket is deliberately not privacy-aware (any member may read
-- any file sent to the household), so a record's file is copied into this
-- bucket once a person confirms it rather than left pointing at the
-- HomeSend upload.
--
-- HomeSend itself gains a fourth intake kind, `health_document`, alongside
-- `bill`/`school_item`/`grocery_item`. One gap that opened the moment a
-- health document became something HomeSend can hold: `home_send_items`'s
-- shared-inbox SELECT policy (any household member, matching every other
-- kind) would otherwise make a health document readable by the whole
-- household for as long as it sits unconfirmed in the pending queue --
-- exactly the membership-alone access the health module's own foundation
-- (20260922070000) refuses everywhere else. So `classified_kind =
-- 'health_document'` is the one case narrowed to its own sender until it is
-- routed (and becomes a properly privacy-scoped `health_records` row) or
-- dismissed.

create table public.health_records (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 160),
  record_type text not null check (record_type in
    ('lab_result', 'prescription', 'imaging_report', 'vaccination_certificate',
     'discharge_summary', 'referral', 'insurance_document', 'visit_summary', 'other')),
  -- The date the document itself is dated (a test date, a visit date) --
  -- never invented; null when the source does not show one.
  document_date date,
  file_path text check (length(trim(file_path)) between 1 and 400),
  notes text check (length(trim(notes)) <= 2000),
  privacy_scope text not null default 'private'
    check (privacy_scope in ('private', 'selected_family', 'household_operational')),
  status text not null default 'active' check (status in ('active', 'archived')),
  source_type text not null default 'manual_entry'
    check (source_type in ('manual_entry', 'home_send_document')),
  provenance_id uuid references public.health_provenance(id) on delete set null,
  created_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.health_records is
  'A household document belonging to exactly one member -- a lab result, prescription or similar. Never a diagnosis or a medical-record replacement, just a filed document with provenance.';

alter table public.health_records enable row level security;

create index health_records_household_idx on public.health_records (household_id, member_id);
create index health_records_recent_idx on public.health_records (household_id, created_at desc) where status = 'active';

create trigger health_records_set_updated_at
  before update on public.health_records
  for each row execute function wh.set_updated_at();

create trigger health_records_member_valid
  before insert or update on public.health_records
  for each row execute function wh.assert_meal_member_in_household('member_id');

-- Same self-or-guardian-only shape 21-001 through 21-004 all use: three
-- separate write policies rather than one `for all`, since a `for all`
-- policy's USING clause also gates SELECT, and no household-admin bypass
-- for private/selected_family data.
create policy health_records_select_visible on public.health_records for select
  to authenticated using (wh.may_see_health(household_id, member_id, privacy_scope));

create policy health_records_insert_self_or_guardian on public.health_records for insert
  to authenticated
  with check (
    wh.is_member(household_id)
    and (
      wh.member_id(household_id) = member_id
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = member_id and g.guardian_member_id = wh.member_id(household_id)
      )
    )
  );

create policy health_records_update_self_or_guardian on public.health_records for update
  to authenticated
  using (
    wh.is_member(household_id)
    and (
      wh.member_id(household_id) = member_id
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = member_id and g.guardian_member_id = wh.member_id(household_id)
      )
    )
  )
  with check (
    wh.is_member(household_id)
    and (
      wh.member_id(household_id) = member_id
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = member_id and g.guardian_member_id = wh.member_id(household_id)
      )
    )
  );

create policy health_records_delete_self_or_guardian on public.health_records for delete
  to authenticated
  using (
    wh.is_member(household_id)
    and (
      wh.member_id(household_id) = member_id
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = member_id and g.guardian_member_id = wh.member_id(household_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Storage -- a dedicated, privacy-scoped bucket. Unlike `avatars`/`home-send`
-- (household-membership-gated), reading an object here also requires
-- `wh.may_see_health()` against the `health_records` row it belongs to --
-- the object's path alone (household folder) is not enough, because the
-- content behind it can be another member's private health document.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('health-records', 'health-records', false)
on conflict (id) do nothing;

-- Upload happens before the owning row can be looked up (the row is created
-- with this same path immediately after), so insert is household-membership
-- gated like every other private bucket; what protects the content
-- afterward is the read policy below, which nothing can see until a
-- matching, properly privacy-scoped `health_records` row exists.
create policy "health_records_insert_member"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'health-records'
    and wh.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "health_records_select_visible"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'health-records'
    and exists (
      select 1 from public.health_records r
      where r.file_path = storage.objects.name
        and wh.may_see_health(r.household_id, r.member_id, r.privacy_scope)
    )
  );

-- ---------------------------------------------------------------------------
-- HomeSend: a fourth intake kind.
-- ---------------------------------------------------------------------------

alter table public.home_send_items drop constraint home_send_items_classified_kind_check;
alter table public.home_send_items add constraint home_send_items_classified_kind_check
  check (classified_kind in ('bill', 'school_item', 'grocery_item', 'health_document', 'unknown'));

-- The one HomeSend kind narrower than the shared-inbox default (see this
-- migration's own header comment) -- everything else stays exactly as
-- household-wide visible as it always was.
drop policy home_send_items_select_member on public.home_send_items;
create policy home_send_items_select_member on public.home_send_items for select
  to authenticated using (
    wh.is_member(household_id)
    and (classified_kind is distinct from 'health_document' or created_by_member_id = wh.member_id(household_id))
  );

alter table public.homesend_changes drop constraint homesend_changes_domain_check;
alter table public.homesend_changes add constraint homesend_changes_domain_check
  check (domain in ('bill', 'school_item', 'grocery_item', 'health_document'));

notify pgrst, 'reload schema';
