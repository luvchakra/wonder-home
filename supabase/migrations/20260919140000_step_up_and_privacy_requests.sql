-- Step-up verification and the Privacy Centre (story 15-007).
--
-- Two tables that answer two different questions.
--
--   step_up_verifications  did this person, just now, prove it was them?
--   privacy_requests       what has somebody asked us to do with their data?
--
-- The first one closes a gap rather than adding a feature. `payment_intents`
-- has carried a `step_up_verified_at` column since 20260917163943, and
-- `mayExecute` refuses to move money without it — but nothing in the product
-- ever set it, because there was nowhere to record a verification and nothing
-- to perform one. A check against a value nobody writes is not a control; it
-- is a control-shaped hole, and the first person to wire payments up would
-- have been tempted to stamp the column and move on.

create table public.step_up_verifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  -- What the person was re-proving themselves for. A verification is not a
  -- skeleton key: confirming a password to export data must not also authorise
  -- a payment that happens to be pending in another tab.
  purpose text not null check (purpose in ('export', 'deletion', 'payment', 'role_change')),
  -- Failures are rows too. A step-up prompt says yes or no to a password
  -- guess from inside a session that is already signed in, which makes it a
  -- better place to brute-force than the sign-in page unless somebody is
  -- counting. Nothing can count attempts that were never written down.
  outcome text not null default 'verified' check (outcome in ('verified', 'failed')),
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- Set when the verification is spent. One proof, one action.
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint step_up_expires_after_verification check (expires_at > verified_at),
  -- A failure never stands as proof of anything, so it is never unspent and
  -- pending: the partial index below simply cannot see it.
  constraint step_up_failure_is_not_proof check (outcome = 'verified' or consumed_at is null)
);

comment on table public.step_up_verifications is
  'Proof that a signed-in person re-confirmed themselves, for one purpose, within a short window. Being signed in says who is asking; this says that they, now, agreed to this.';

alter table public.step_up_verifications enable row level security;

-- The only lookup this table serves: the freshest unspent verification for one
-- member and purpose.
create index step_up_verifications_lookup_idx
  on public.step_up_verifications (member_id, purpose, expires_at desc)
  where outcome = 'verified' and consumed_at is null;

-- Counting recent attempts, successful or not, for the lockout.
create index step_up_verifications_attempts_idx
  on public.step_up_verifications (member_id, verified_at desc);

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- Who asked. Kept even after the member row goes, so a deletion that
  -- completed still has a record that somebody asked for it.
  requested_by_member_id uuid references public.household_members(id) on delete set null,
  -- Whose data. Usually the requester; a guardian may ask on behalf of a child.
  subject_member_id uuid references public.household_members(id) on delete set null,
  kind text not null check (kind in ('export', 'deletion')),
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'completed', 'cancelled', 'refused')),
  -- Deletion waits. The window is the household's chance to change its mind,
  -- and it is the whole reason a deletion is a request rather than a button.
  acts_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  -- Why a request was refused, in the household's own words. Never free text
  -- from a caller: the server writes it.
  refusal_reason text check (refusal_reason is null or length(trim(refusal_reason)) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.privacy_requests is
  'Export and deletion requests. A deletion is a request with a grace window rather than a button, so a moment of anger is recoverable.';

alter table public.privacy_requests enable row level security;

create index privacy_requests_household_idx
  on public.privacy_requests (household_id, created_at desc);

-- At most one live request of each kind per subject: a second export while the
-- first is still pending is the same ask, and a second deletion is a way to
-- move the grace window.
create unique index privacy_requests_one_live_per_subject
  on public.privacy_requests (household_id, subject_member_id, kind)
  where status in ('pending', 'ready');

create trigger privacy_requests_set_updated_at
  before update on public.privacy_requests
  for each row execute function wh.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Both tables are about one person's own proof and one person's own data, so
-- neither is readable household-wide. An administrator sees deletion requests
-- because a household losing a member is the household's business; an export
-- is nobody's business but the person who asked for it.
-- ---------------------------------------------------------------------------

create policy step_up_verifications_select_own on public.step_up_verifications for select
  to authenticated using (member_id = wh.member_id(household_id));

-- No insert, update or delete policy. Verifications are written by the server
-- after it has actually checked something; a client that could insert one
-- could grant itself the very thing the check exists to require.

create policy privacy_requests_select_own on public.privacy_requests for select
  to authenticated using (
    subject_member_id = wh.member_id(household_id)
    or requested_by_member_id = wh.member_id(household_id)
    or (kind = 'deletion' and wh.is_household_admin(household_id))
  );

-- A person may ask about their own data, and may change their mind about a
-- deletion they asked for. Whether they confirmed themselves first is checked
-- in application code, which is authoritative — the database cannot see a
-- step-up, so RLS here is the second line it is meant to be, narrowing every
-- write to the one person it can be about.
create policy privacy_requests_insert_own on public.privacy_requests for insert
  to authenticated with check (
    subject_member_id = wh.member_id(household_id)
    and requested_by_member_id = wh.member_id(household_id)
  );

create policy privacy_requests_update_own on public.privacy_requests for update
  to authenticated
  using (subject_member_id = wh.member_id(household_id))
  with check (subject_member_id = wh.member_id(household_id));

-- No delete policy: withdrawing a request is a status change, so the record of
-- having asked survives. A privacy request people can erase is one nobody can
-- be held to.

notify pgrst, 'reload schema';
