-- Household operating model (stories 02-002, 02-003, 02-004, 02-005).
--
-- Applied to the wonder-home Supabase project as version 20260917015316.
--
-- Four tables that together say how a household actually runs:
--
--   playbook_items          what a good outcome looks like, and how it is verified
--   playbook_dependencies   which outcomes need which others first
--   responsibilities        who owns each outcome, who covers, and how far AI may act
--   policies                the household's own rules, versioned
--
-- The autonomy level lives on the responsibility rather than in a settings blob
-- because it is consulted at execution time, not displayed on a screen. An
-- outcome with no configured responsibility resolves to 'observe', so anything
-- nobody has thought about is watched and never acted on.

create table public.playbook_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- A stable key the planner and AI tools refer to, e.g. 'laundry.ready'.
  outcome_key text not null check (outcome_key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  name text not null check (length(trim(name)) between 1 and 120),
  -- The desired state in the family's own words, not a task description.
  outcome_definition text not null check (length(trim(outcome_definition)) between 1 and 500),
  cadence jsonb not null default '{}'::jsonb,
  operating_window jsonb not null default '{}'::jsonb,
  verification jsonb not null default '{}'::jsonb,
  escalation jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, outcome_key)
);

comment on table public.playbook_items is
  'How a normal household outcome operates: what good looks like, how often, in what window, how it is verified and who is told when it is at risk.';

alter table public.playbook_items enable row level security;

create index playbook_items_household_idx on public.playbook_items (household_id) where active;

create trigger playbook_items_set_updated_at
  before update on public.playbook_items
  for each row execute function wh.set_updated_at();

create table public.playbook_dependencies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  playbook_item_id uuid not null references public.playbook_items(id) on delete cascade,
  depends_on_item_id uuid not null references public.playbook_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (playbook_item_id, depends_on_item_id),
  constraint playbook_dependencies_not_self check (playbook_item_id <> depends_on_item_id)
);

comment on table public.playbook_dependencies is
  'Upstream outcomes an item needs. A separate table rather than an array so the graph can be queried and cycles detected.';

alter table public.playbook_dependencies enable row level security;

create index playbook_dependencies_item_idx on public.playbook_dependencies (playbook_item_id);

create table public.responsibilities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  outcome_key text not null check (outcome_key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  playbook_item_id uuid references public.playbook_items(id) on delete set null,
  -- Nullable so an unowned outcome is representable: the matrix has to be able
  -- to show a gap, which is the most useful thing it can tell a household.
  primary_member_id uuid references public.household_members(id) on delete set null,
  backup_member_id uuid references public.household_members(id) on delete set null,
  ai_mode text not null default 'observe'
    check (ai_mode in ('observe', 'prepare', 'approve', 'execute')),
  priority integer not null default 3 check (priority between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, outcome_key),
  -- A backup who is also the primary is not a backup.
  constraint responsibilities_backup_differs check (
    backup_member_id is null or backup_member_id <> primary_member_id
  )
);

comment on table public.responsibilities is
  'Who owns each outcome, who covers for them, and how far WonderHome may act on its own.';

alter table public.responsibilities enable row level security;

create index responsibilities_primary_idx on public.responsibilities (primary_member_id);
create index responsibilities_backup_idx on public.responsibilities (backup_member_id);

create trigger responsibilities_set_updated_at
  before update on public.responsibilities
  for each row execute function wh.set_updated_at();

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category text not null check (category in
    ('spending', 'privacy', 'family_time', 'notifications', 'ai_autonomy', 'safety')),
  name text not null check (length(trim(name)) between 1 and 120),
  rule jsonb not null,
  version integer not null default 1 check (version >= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, category, name, version)
);

comment on table public.policies is
  'Household rules, versioned. A policy is never edited in place: a change creates a new version so what was in force at the time stays knowable.';

alter table public.policies enable row level security;

-- Many versions may exist; exactly one may be in force.
create unique index policies_one_active_per_name
  on public.policies (household_id, category, name) where active;

create trigger policies_set_updated_at
  before update on public.policies
  for each row execute function wh.set_updated_at();

-- ---------------------------------------------------------------------------
-- Integrity
-- ---------------------------------------------------------------------------

-- An outcome cannot be assigned to someone who is not an active member of this
-- household — the story's "prevents assignment to an inactive/non-member target".
create or replace function wh.assert_responsibility_members_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primary uuid;
  v_backup uuid;
  v_primary_status text;
  v_backup_status text;
begin
  if new.primary_member_id is not null then
    select household_id, status into v_primary, v_primary_status
    from public.household_members where id = new.primary_member_id;

    if v_primary is distinct from new.household_id then
      raise exception 'Primary owner % is not part of household %', new.primary_member_id, new.household_id
        using errcode = 'foreign_key_violation';
    end if;
    if v_primary_status <> 'active' then
      raise exception 'Primary owner % is not an active member', new.primary_member_id
        using errcode = 'check_violation';
    end if;
  end if;

  if new.backup_member_id is not null then
    select household_id, status into v_backup, v_backup_status
    from public.household_members where id = new.backup_member_id;

    if v_backup is distinct from new.household_id then
      raise exception 'Backup owner % is not part of household %', new.backup_member_id, new.household_id
        using errcode = 'foreign_key_violation';
    end if;
    if v_backup_status <> 'active' then
      raise exception 'Backup owner % is not an active member', new.backup_member_id
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger responsibilities_members_valid
  before insert or update on public.responsibilities
  for each row execute function wh.assert_responsibility_members_in_household();

create or replace function wh.assert_dependency_same_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item uuid;
  v_dep uuid;
begin
  select household_id into v_item from public.playbook_items where id = new.playbook_item_id;
  select household_id into v_dep from public.playbook_items where id = new.depends_on_item_id;

  if v_item is distinct from new.household_id or v_dep is distinct from new.household_id then
    raise exception 'Both playbook items must belong to household %', new.household_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger playbook_dependencies_same_household
  before insert or update on public.playbook_dependencies
  for each row execute function wh.assert_dependency_same_household();

-- ---------------------------------------------------------------------------
-- Autonomy
-- ---------------------------------------------------------------------------

create or replace function wh.autonomy_for(p_household_id uuid, p_outcome_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.ai_mode from public.responsibilities r
     where r.household_id = p_household_id and r.outcome_key = p_outcome_key),
    'observe'
  );
$$;

comment on function wh.autonomy_for(uuid, text) is
  'The configured autonomy for an outcome, defaulting to observe. An unconfigured outcome is never acted on automatically.';

grant execute on function wh.autonomy_for(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Every member reads the operating model — a household cannot be run by rules
-- only some of its people can see. Changing it is an administrator's job.
-- ---------------------------------------------------------------------------

create policy playbook_items_select_member on public.playbook_items for select
  to authenticated using (wh.is_member(household_id));
create policy playbook_items_write_admin on public.playbook_items for all
  to authenticated using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create policy playbook_dependencies_select_member on public.playbook_dependencies for select
  to authenticated using (wh.is_member(household_id));
create policy playbook_dependencies_write_admin on public.playbook_dependencies for all
  to authenticated using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create policy responsibilities_select_member on public.responsibilities for select
  to authenticated using (wh.is_member(household_id));
create policy responsibilities_write_admin on public.responsibilities for all
  to authenticated using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create policy policies_select_member on public.policies for select
  to authenticated using (wh.is_member(household_id));
create policy policies_write_admin on public.policies for all
  to authenticated using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

notify pgrst, 'reload schema';
