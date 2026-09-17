-- Identity & Family Accounts foundation (stories 01-001, 01-003).
--
-- Applied to the wonder-home Supabase project as version 20260917005417.
--
-- Establishes the tenant model every later module hangs off: a household, the
-- members in it, the role each member holds, and the audit trail for changes to
-- any of that.
--
-- Two decisions worth stating, because both are load-bearing:
--
-- 1. Household creation goes through wh.create_household(). A household has no
--    members at the instant it is created, so no membership-based RLS policy
--    can authorize its own INSERT — the classic bootstrap problem. A SECURITY
--    DEFINER function creates the household, its first member, that member's
--    Head of Family role and the audit record in one transaction, so a
--    half-created tenant cannot exist and no direct INSERT policy is needed.
--
-- 2. Ownership is a single row, not a flag. households.owner_member_id is the
--    ownership record, and a partial unique index allows exactly one 'head'
--    role per household. A trigger keeps the two in agreement, so "a second
--    ownership record cannot be created for the same household" is structural
--    rather than something application code must remember.

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  avatar_url text,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per authenticated person. A person may belong to several households.';

alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function wh.set_updated_at();

-- ---------------------------------------------------------------------------
-- Households and membership
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  timezone text not null default 'Asia/Kolkata',
  -- Nullable only for the instant between inserting the household and its first
  -- member inside wh.create_household(); the trigger below rejects any other case.
  owner_member_id uuid,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.households is 'The tenant. Every household-owned row carries household_id.';

alter table public.households enable row level security;

create trigger households_set_updated_at
  before update on public.households
  for each row execute function wh.set_updated_at();

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- Null for a member with no account of their own: a young child, or a
  -- househelper whose work is tracked without asking them to use an app.
  profile_id uuid references public.profiles(id) on delete set null,
  member_type text not null check (member_type in ('adult', 'child', 'helper')),
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  date_of_birth date,
  status text not null default 'active' check (status in ('active', 'invited', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One identity per household per person: the same account cannot hold two
  -- member records in the same household.
  unique (household_id, profile_id)
);

comment on table public.household_members is
  'A person''s identity within one household. Cross-household references are rejected.';

alter table public.household_members enable row level security;

create index household_members_household_idx on public.household_members (household_id);
create index household_members_profile_idx on public.household_members (profile_id);

create trigger household_members_set_updated_at
  before update on public.household_members
  for each row execute function wh.set_updated_at();

alter table public.households
  add constraint households_owner_member_fk
  foreign key (owner_member_id) references public.household_members(id) on delete restrict;

create table public.household_roles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  role text not null check (role in ('head', 'administrator', 'adult', 'child', 'helper')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, member_id, role)
);

comment on table public.household_roles is
  'Role grants. Exactly one head per household; administrators are designated by the head.';

alter table public.household_roles enable row level security;

create index household_roles_member_idx on public.household_roles (member_id);

-- Exactly one Head of Family per household.
create unique index household_roles_one_head_per_household
  on public.household_roles (household_id)
  where role = 'head';

create trigger household_roles_set_updated_at
  before update on public.household_roles
  for each row execute function wh.set_updated_at();

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete set null,
  actor_member_id uuid references public.household_members(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  target_table text,
  target_id uuid,
  -- Privacy-minimized: what changed and by whom, never the household content
  -- itself and never a credential.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_events is
  'Append-only record of sensitive actions. Readable by household administrators, never writable from the client.';

alter table public.audit_events enable row level security;

create index audit_events_household_created_idx
  on public.audit_events (household_id, created_at desc);
