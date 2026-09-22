-- Health & Fitness foundation (story 21-001).
--
-- Approved by Product Council decision
-- `50173d0a-WonderHome_Health_Fitness_Product_Council_Claude_Code_Requirements.md`,
-- 21 Sep 2026. Health is a first-class WonderHome domain, but it is not a
-- diagnosis, treatment or medical-record-replacement system, and household
-- membership never by itself grants access to another adult's health data —
-- the product's own worked example is the test: "Dad has a cardiology
-- appointment" is private to Dad; "Dad unavailable 5-6pm" is what the rest of
-- the household may see.
--
-- Three tables this story adds:
--
--   health_profiles    -- a member's own health-domain settings.
--   health_provenance  -- source/confidence/confirmation for a health fact,
--                         the same shape `memories` already established
--                         (source_type/confidence/status), factored into its
--                         own table because every later health entity
--                         (appointment, issue, checkup, record, measurement)
--                         references one row here rather than repeating the
--                         four columns five times.
--   health_consents    -- the sharing ACL: a subject member explicitly
--                         grants another member SELECTED_FAMILY visibility
--                         into their own health data. Nothing like this
--                         exists yet -- `member_guardians` is guardian-
--                         specific and admin-managed, not something a
--                         subject grants themselves.
--
-- Every later health table carries `privacy_scope` and gates its own SELECT
-- policy through `wh.may_see_health()` below, applied per row against that
-- row's own scope -- deliberately not a blanket household-admin bypass for
-- `private`/`selected_family` data, since the product's own examples treat
-- an administrator as just another household member for someone else's
-- private health information. The one exception (mirroring `wh.may_see_child`)
-- is a guardian and the child they guard, where the existing
-- `member_guardians` relationship already carries that authority.

create table public.health_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  privacy_scope text not null default 'private'
    check (privacy_scope in ('private', 'selected_family', 'household_operational')),
  ai_assistance_enabled boolean not null default true,
  created_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, member_id)
);

comment on table public.health_profiles is
  'A member''s own health-domain settings -- whether WonderHome''s AI may help manage their health data, and the default privacy scope new health entries get. Not the health data itself.';

alter table public.health_profiles enable row level security;

create index health_profiles_household_idx on public.health_profiles (household_id);

create trigger health_profiles_set_updated_at
  before update on public.health_profiles
  for each row execute function wh.set_updated_at();

create trigger health_profiles_member_valid
  before insert or update on public.health_profiles
  for each row execute function wh.assert_meal_member_in_household('member_id');

create table public.health_provenance (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  source_type text not null check (source_type in
    ('home_talk', 'home_send_email', 'home_send_document', 'manual_entry', 'calendar', 'future_health_integration')),
  source_reference text check (length(trim(source_reference)) <= 200),
  evidence text check (length(trim(evidence)) <= 2000),
  extraction_method text check (length(trim(extraction_method)) <= 100),
  confidence numeric(3, 2) not null default 1.0 check (confidence between 0 and 1),
  confirmed_by uuid references public.household_members(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint health_provenance_confirmation_paired
    check ((confirmed_by is null) = (confirmed_at is null))
);

comment on table public.health_provenance is
  'Why WonderHome knows a health fact -- source, confidence and confirmation, the same shape memories already uses. Referenced by every later health entity so "why does WonderHome know this" is always answerable.';

alter table public.health_provenance enable row level security;

create index health_provenance_household_idx on public.health_provenance (household_id);

create table public.health_consents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  subject_member_id uuid not null references public.household_members(id) on delete cascade,
  viewer_member_id uuid not null references public.household_members(id) on delete cascade,
  granted_by_member_id uuid not null references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, subject_member_id, viewer_member_id),
  constraint health_consents_distinct_people check (subject_member_id <> viewer_member_id)
);

comment on table public.health_consents is
  'A subject member''s own grant of SELECTED_FAMILY visibility into their health data to one other member. Only the subject (or, for a child, their guardian) may create or revoke one -- see wh.may_see_health().';

alter table public.health_consents enable row level security;

create index health_consents_household_idx on public.health_consents (household_id);
create index health_consents_viewer_idx on public.health_consents (household_id, viewer_member_id);

create trigger health_consents_subject_valid
  before insert or update on public.health_consents
  for each row execute function wh.assert_meal_member_in_household('subject_member_id');

create trigger health_consents_viewer_valid
  before insert or update on public.health_consents
  for each row execute function wh.assert_meal_member_in_household('viewer_member_id');

/**
 * Whether the caller may see one health entity carrying `p_privacy_scope`
 * and belonging to `p_subject_member_id`.
 *
 * Deliberately not `wh.is_household_admin(...)` for `private`/
 * `selected_family`: the product's own worked example draws the line at
 * household membership, not household administration, for another adult's
 * private health information. The one relationship that does carry
 * authority over someone else's health data without their own consent is
 * guardianship, already recorded in `member_guardians` for exactly this
 * reason in the school module.
 */
create or replace function wh.may_see_health(
  p_household_id uuid,
  p_subject_member_id uuid,
  p_privacy_scope text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    wh.is_member(p_household_id)
    and (
      wh.member_id(p_household_id) = p_subject_member_id
      or p_privacy_scope = 'household_operational'
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = p_subject_member_id
          and g.guardian_member_id = wh.member_id(p_household_id)
      )
      or (
        p_privacy_scope = 'selected_family'
        and exists (
          select 1 from public.health_consents c
          where c.household_id = p_household_id
            and c.subject_member_id = p_subject_member_id
            and c.viewer_member_id = wh.member_id(p_household_id)
        )
      )
    );
$$;

comment on function wh.may_see_health is
  'Per-row health visibility: the subject always, everyone for household_operational, a guardian for their child, and a viewer the subject explicitly granted selected_family consent to. Never a blanket household-admin bypass for private/selected_family data.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

create policy health_profiles_select_visible on public.health_profiles for select
  to authenticated using (wh.may_see_health(household_id, member_id, privacy_scope));

-- Deliberately three separate policies rather than one `for all`: a `for
-- all` policy's USING clause also gates SELECT, and an admin bypass here
-- (setting up a member's health settings is an administrative convenience)
-- would then let an admin read another adult's private profile straight
-- back through the very SELECT the policy above exists to refuse — the same
-- class of bug `household_webhooks` was caught making with `household_ai_
-- credentials`'s `for all` shape (story 18-007). So there is no admin
-- bypass here at all: only the subject themselves, or a guardian for the
-- child they guard, both of whom `may_see_health` already grants SELECT
-- visibility to (which is what lets a WHERE-conditioned UPDATE/DELETE find
-- the row in the first place -- Postgres needs that visibility for a
-- targeted write on any RLS-enabled table, not just the write policy's own
-- USING clause).
create policy health_profiles_insert_self_or_guardian on public.health_profiles for insert
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

create policy health_profiles_update_self_or_guardian on public.health_profiles for update
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

create policy health_profiles_delete_self_or_guardian on public.health_profiles for delete
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

-- Provenance metadata (source, confidence) is not itself sensitive health
-- content -- household-wide read, written by whoever creates the health
-- entity it describes.
create policy health_provenance_select_member on public.health_provenance for select
  to authenticated using (wh.is_member(household_id));

create policy health_provenance_insert_member on public.health_provenance for insert
  to authenticated with check (wh.is_member(household_id));

-- Confirming a fact is the one update this table needs (certification-style
-- review); nothing else about a provenance row changes once written.
create policy health_provenance_update_member on public.health_provenance for update
  to authenticated
  using (wh.is_member(household_id))
  with check (wh.is_member(household_id));

create policy health_consents_select_party on public.health_consents for select
  to authenticated
  using (
    wh.is_member(household_id)
    and (
      subject_member_id = wh.member_id(household_id)
      or viewer_member_id = wh.member_id(household_id)
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = subject_member_id and g.guardian_member_id = wh.member_id(household_id)
      )
    )
  );

create policy health_consents_write_subject_or_guardian on public.health_consents for all
  to authenticated
  using (
    wh.is_member(household_id)
    and (
      subject_member_id = wh.member_id(household_id)
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = subject_member_id and g.guardian_member_id = wh.member_id(household_id)
      )
    )
  )
  with check (
    wh.is_member(household_id)
    and (
      subject_member_id = wh.member_id(household_id)
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = subject_member_id and g.guardian_member_id = wh.member_id(household_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Entitlement: health.tracking, seeded onto the same plans 20-001 already
-- catalogued. Not on Free, the same tier `family.events`/`finance.bills`
-- already sit at -- health is a rich enough domain to be a paid-plan feature
-- rather than part of the free household basics.
-- ---------------------------------------------------------------------------

insert into public.plan_features (plan_key, feature_key, enabled, limit_per_period, period) values
  ('pro', 'health.tracking', true, null, 'forever'),
  ('max', 'health.tracking', true, null, 'forever');

notify pgrst, 'reload schema';
