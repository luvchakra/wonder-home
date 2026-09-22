-- Health & Fitness: health issues (story 21-003).
--
-- Everyday health observations, never a diagnosis: `label`/`description` are
-- always whatever the household actually said or noticed, and nothing in
-- this schema or the application layer ever infers a medical condition from
-- them. `packages/core/src/health/issue-safety.ts`'s `assessForMedicalAttention`
-- is a deterministic keyword check against a fixed, tested list — never a
-- model call, never a diagnosis engine — and the strongest thing it can ever
-- produce is a recommendation to seek medical attention.
--
-- Same RLS shape as `health_appointments` and `health_profiles`: select via
-- `wh.may_see_health()`, self-or-guardian-only writes, no admin bypass.
--
-- `health_provenance` (21-001) is finally used by something: every issue
-- links to one row there recording who/how it was confirmed. That table is
-- deliberately household-wide readable (its own migration comment: "not
-- itself sensitive health content"), so the row this creates carries only
-- source_type/confidence/confirmed_by/confirmed_at -- never the issue's own
-- label, description or notes. Putting health content into a shared,
-- unscoped table would defeat the entire point of `privacy_scope`.

create table public.health_issues (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 160),
  description text check (length(trim(description)) <= 2000),
  status text not null default 'mentioned'
    check (status in ('mentioned', 'active', 'monitoring', 'resolved', 'closed')),
  privacy_scope text not null default 'private'
    check (privacy_scope in ('private', 'selected_family', 'household_operational')),
  source_type text not null default 'manual_entry' check (source_type in
    ('home_talk', 'home_send_email', 'home_send_document', 'manual_entry', 'calendar', 'future_health_integration')),
  provenance_id uuid references public.health_provenance(id) on delete set null,
  notes text check (length(trim(notes)) <= 1000),
  started_at date not null default current_date,
  resolved_at date,
  created_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_issues_resolved_at_matches_status check (
    (status in ('resolved', 'closed') and resolved_at is not null)
    or (status not in ('resolved', 'closed') and resolved_at is null)
  )
);

comment on table public.health_issues is
  'An everyday health observation and its lifecycle -- never a diagnosis. privacy_scope gates visibility the same way health_profiles does -- see wh.may_see_health().';

alter table public.health_issues enable row level security;

create index health_issues_household_idx on public.health_issues (household_id);
create index health_issues_member_status_idx on public.health_issues (member_id, status);

create trigger health_issues_set_updated_at
  before update on public.health_issues
  for each row execute function wh.set_updated_at();

create trigger health_issues_member_valid
  before insert or update on public.health_issues
  for each row execute function wh.assert_meal_member_in_household('member_id');

create policy health_issues_select_visible on public.health_issues for select
  to authenticated using (wh.may_see_health(household_id, member_id, privacy_scope));

create policy health_issues_insert_self_or_guardian on public.health_issues for insert
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

create policy health_issues_update_self_or_guardian on public.health_issues for update
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

create policy health_issues_delete_self_or_guardian on public.health_issues for delete
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

notify pgrst, 'reload schema';
