-- Kids and school intelligence (stories 08-001 through 08-008).
--
-- Applied to the wonder-home Supabase project as version 20260917142613.
--
-- The canonical model is deliberately not the shape any school portal uses.
-- Portals disagree about almost everything — what a "class" is, whether an exam
-- is an assignment, how a worksheet is attached — and a schema that mirrors one
-- of them becomes a schema that can only ever talk to that one.
--
-- What is kept from the provider is identity: `integration_id` plus
-- `external_id`, which is what makes a re-import reconcile onto the row that is
-- already there instead of creating a second copy of a child's homework.
--
-- Guardianship is the access rule throughout. A household member is not
-- entitled to a child's school work by virtue of living there; a guardian is,
-- and the child is, and that distinction is enforced here as well as in the API.

create table public.school_enrolments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_member_id uuid not null references public.household_members(id) on delete cascade,
  school_name text not null check (length(trim(school_name)) between 1 and 160),
  grade text check (length(trim(grade)) <= 40),
  section text check (length(trim(section)) <= 40),
  -- Where this came from, when it came from anywhere. Null means the household
  -- typed it in, which is a perfectly good source and has to stay possible.
  integration_id uuid references public.integrations(id) on delete set null,
  external_id text check (length(trim(external_id)) <= 200),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (child_member_id, school_name)
);

comment on table public.school_enrolments is
  'A child at a school. The anchor every imported item hangs from, whether it arrived from a portal or was typed in.';

alter table public.school_enrolments enable row level security;

create trigger school_enrolments_set_updated_at
  before update on public.school_enrolments
  for each row execute function wh.set_updated_at();

create table public.school_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_member_id uuid not null references public.household_members(id) on delete cascade,
  enrolment_id uuid references public.school_enrolments(id) on delete set null,
  kind text not null check (kind in ('homework', 'worksheet', 'exam', 'project', 'event', 'notice')),
  title text not null check (length(trim(title)) between 1 and 200),
  subject text check (length(trim(subject)) <= 80),
  detail text check (length(trim(detail)) <= 2000),
  due_at timestamptz,
  -- What WonderHome thinks this takes. An estimate the household can correct,
  -- never a number presented as fact.
  estimated_minutes integer check (estimated_minutes between 1 and 600),
  estimate_source text check (estimate_source in ('provider', 'inferred', 'member_confirmed')),
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'submitted', 'done', 'missed', 'cancelled')),
  -- Never set by a connector. A portal saying nothing is not a child saying done.
  completed_at timestamptz,
  completion_source text check (completion_source in ('member_confirmed', 'provider_confirmed')),
  integration_id uuid references public.integrations(id) on delete set null,
  provider text check (length(trim(provider)) <= 60),
  external_id text check (length(trim(external_id)) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Identity from a provider is what makes an import idempotent. Two rows for
  -- the same portal item is the failure this constraint exists to prevent.
  unique (integration_id, external_id),
  constraint school_items_estimate_has_source check (
    (estimated_minutes is null) = (estimate_source is null)
  ),
  -- A completion has to say who said so. "Done" with no source is exactly the
  -- silent auto-complete the acceptance criteria forbid.
  constraint school_items_completion_has_source check (
    (completed_at is null) = (completion_source is null)
  ),
  constraint school_items_done_is_completed check (
    status not in ('done', 'submitted') or completed_at is not null
  )
);

comment on table public.school_items is
  'Canonical homework, exams and school events. Provider-independent by design; a portal''s identity is kept only for deduplication.';

alter table public.school_items enable row level security;

create index school_items_due_idx on public.school_items (household_id, due_at)
  where status in ('pending', 'in_progress');
create index school_items_child_idx on public.school_items (child_member_id, due_at desc);

create trigger school_items_set_updated_at
  before update on public.school_items
  for each row execute function wh.set_updated_at();

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_member_id uuid not null references public.household_members(id) on delete cascade,
  school_item_id uuid references public.school_items(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Whether a person put this here or WonderHome proposed it. A proposal a
  -- child never agreed to should not look like a commitment they made.
  source text not null default 'planned' check (source in ('planned', 'proposed', 'member_confirmed')),
  created_at timestamptz not null default now(),
  constraint study_sessions_ordered check (starts_at < ends_at)
);

comment on table public.study_sessions is
  'When a child is actually going to do the work. Plans are proposals until somebody agrees to them.';

alter table public.study_sessions enable row level security;

create index study_sessions_child_idx on public.study_sessions (child_member_id, starts_at);

create table public.school_documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_member_id uuid not null references public.household_members(id) on delete cascade,
  school_item_id uuid references public.school_items(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 200),
  -- A reference into storage, never the file. What a child hands in is theirs,
  -- and the database is not where it belongs.
  storage_path text not null check (length(trim(storage_path)) between 1 and 400),
  content_type text check (length(trim(content_type)) <= 120),
  byte_size bigint check (byte_size >= 0),
  -- Where it came from and whether the household was entitled to it. A document
  -- pulled from a portal without consent is a document that should not exist.
  source text not null default 'uploaded' check (source in ('uploaded', 'provider', 'generated')),
  integration_id uuid references public.integrations(id) on delete set null,
  external_id text check (length(trim(external_id)) <= 200),
  created_at timestamptz not null default now(),
  unique (integration_id, external_id)
);

comment on table public.school_documents is
  'Worksheets and school paperwork, by reference. Guardian-gated at the database as well as the API.';

alter table public.school_documents enable row level security;

create index school_documents_child_idx on public.school_documents (child_member_id, created_at desc);

create table public.school_communications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_member_id uuid references public.household_members(id) on delete cascade,
  integration_id uuid references public.integrations(id) on delete set null,
  external_id text check (length(trim(external_id)) <= 200),
  received_at timestamptz not null default now(),
  subject text check (length(trim(subject)) <= 200),
  -- A summary the household can read, not the original. Keeping school mail
  -- verbatim means keeping other families' children in it too.
  summary text not null check (length(trim(summary)) between 1 and 1000),
  -- What this actually asks of the household, if anything. A notice that needs
  -- nothing is filed, not surfaced.
  requires_action boolean not null default false,
  action_label text check (length(trim(action_label)) <= 120),
  action_due_at timestamptz,
  created_at timestamptz not null default now(),
  unique (integration_id, external_id),
  constraint school_communications_action_has_label check (
    not requires_action or action_label is not null
  )
);

comment on table public.school_communications is
  'School messages reduced to a summary and, when there is one, the thing the household has to do.';

alter table public.school_communications enable row level security;

create index school_communications_action_idx on public.school_communications (household_id, action_due_at)
  where requires_action;

-- ---------------------------------------------------------------------------
-- Cross-table invariants
-- ---------------------------------------------------------------------------

create or replace function wh.assert_child_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_type text;
begin
  if new.child_member_id is null then
    return new;
  end if;

  select household_id, member_type into v_household, v_type
  from public.household_members where id = new.child_member_id;

  if v_household is distinct from new.household_id then
    raise exception 'Member % is not part of household %', new.child_member_id, new.household_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger school_enrolments_child_valid
  before insert or update on public.school_enrolments
  for each row execute function wh.assert_child_in_household();

create trigger school_items_child_valid
  before insert or update on public.school_items
  for each row execute function wh.assert_child_in_household();

create trigger study_sessions_child_valid
  before insert or update on public.study_sessions
  for each row execute function wh.assert_child_in_household();

create trigger school_documents_child_valid
  before insert or update on public.school_documents
  for each row execute function wh.assert_child_in_household();

create trigger school_communications_child_valid
  before insert or update on public.school_communications
  for each row execute function wh.assert_child_in_household();

-- ---------------------------------------------------------------------------
-- Guardianship
--
-- The access rule for this whole module, in one function so that every policy
-- asks the same question. Living in the household is not enough: a child's
-- school work is visible to the child, to their guardians and to household
-- administrators, and to nobody else — which is what "guardian authorization
-- controls access at both API and database layers" has to mean if it is to mean
-- anything.
-- ---------------------------------------------------------------------------

create or replace function wh.may_see_child(p_household_id uuid, p_child_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    wh.is_household_admin(p_household_id)
    or wh.member_id(p_household_id) = p_child_member_id
    or exists (
      select 1 from public.member_guardians g
      where g.child_member_id = p_child_member_id
        and g.guardian_member_id = wh.member_id(p_household_id)
    );
$$;

comment on function wh.may_see_child is
  'Whether the caller may see a particular child''s school data: the child, their guardians, or an administrator.';

create policy school_enrolments_select_guardian on public.school_enrolments for select
  to authenticated using (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id));

create policy school_enrolments_write_guardian on public.school_enrolments for all
  to authenticated
  using (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id))
  with check (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id));

create policy school_items_select_guardian on public.school_items for select
  to authenticated using (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id));

create policy school_items_write_guardian on public.school_items for all
  to authenticated
  using (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id))
  with check (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id));

create policy study_sessions_select_guardian on public.study_sessions for select
  to authenticated using (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id));

create policy study_sessions_write_guardian on public.study_sessions for all
  to authenticated
  using (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id))
  with check (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id));

create policy school_documents_select_guardian on public.school_documents for select
  to authenticated using (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id));

create policy school_documents_write_guardian on public.school_documents for all
  to authenticated
  using (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id))
  with check (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id));

-- A communication with no child named concerns the household as a whole, so it
-- falls back to administrators rather than becoming visible to everyone.
create policy school_communications_select_guardian on public.school_communications for select
  to authenticated using (
    wh.is_member(household_id)
    and (
      child_member_id is null and wh.is_household_admin(household_id)
      or child_member_id is not null and wh.may_see_child(household_id, child_member_id)
    )
  );

create policy school_communications_write_admin on public.school_communications for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

notify pgrst, 'reload schema';
