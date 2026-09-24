-- Intelligent household onboarding (story 02-009).
--
-- Onboarding is an orchestration layer over what already exists: every
-- person, pet, helper, school and responsibility it records is written to the
-- domain's own table, through the domain's own function, so HomeBrain and
-- every module read it without knowing onboarding happened. This migration
-- adds only what those tables could not already hold:
--
--   * household_onboarding — where a household is in setup: its draft
--     composition (how many adults, children, pets and helpers it said it
--     has, before any of them has a name), the step it reached, whether it
--     chose to finish later, and the suggestions it said "not for us" to.
--     Suggestions themselves are never stored: they are computed from real
--     data every time, so one can never outlive the facts it came from.
--   * onboarding_events — what happened during setup, in closed words and
--     counts only, for measuring how much effort setup takes.
--   * household_members.work_arrangement and a stated age for a child whose
--     date of birth the family did not give.
--   * household_invitations.member_id — an invitation that claims a member
--     already on record, so the adult added during setup who later accepts
--     an invitation becomes that member rather than a second one.

-- Members: how an adult works, and an age said instead of a birthday -------

alter table public.household_members
  add column work_arrangement text
    check (work_arrangement in ('office', 'home', 'hybrid', 'not_working')),
  add column age_years smallint check (age_years between 0 and 120),
  add column age_recorded_on date,
  add constraint household_members_age_recorded
    check ((age_years is null) = (age_recorded_on is null));

comment on column public.household_members.work_arrangement is
  'Where an adult works, as the family said it. Shapes suggestions; never a permission.';
comment on column public.household_members.age_years is
  'An age the family gave instead of a date of birth, true on age_recorded_on. Current age is derived from it; a real date of birth always wins.';

-- Onboarding state ----------------------------------------------------------

create table public.household_onboarding (
  household_id uuid primary key references public.households(id) on delete cascade,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'deferred', 'completed')),
  -- The last step the household reached, so "Continue" lands there.
  step text not null default 'welcome'
    check (step in ('welcome', 'basics', 'overview', 'adults', 'children', 'pets', 'suggestions', 'review', 'summary', 'guided', 'done')),
  -- What the family said it has, before anyone has a name. Draft only: no
  -- placeholder member is ever created from these.
  adults smallint not null default 1 check (adults between 1 and 12),
  children smallint not null default 0 check (children between 0 and 12),
  pets smallint not null default 0 check (pets between 0 and 12),
  helpers smallint not null default 0 check (helpers between 0 and 12),
  -- Suggestion keys the household said "not for us" to, so they are not
  -- offered again. Accepted ones are real responsibilities, not listed here.
  dismissed_suggestions text[] not null default '{}'
    check (cardinality(dismissed_suggestions) <= 200),
  started_at timestamptz not null default now(),
  deferred_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by_member_id uuid references public.household_members(id) on delete set null
);

comment on table public.household_onboarding is
  'Where a household is in its first setup. Draft composition and progress only — every real fact lives in its domain table.';

alter table public.household_onboarding enable row level security;

create trigger household_onboarding_set_updated_at
  before update on public.household_onboarding
  for each row execute function wh.set_updated_at();

-- Every member may see how far setup has got (the dashboard says so); only an
-- Admin may move it, because only an Admin can make the changes it records.
create policy household_onboarding_select_member
  on public.household_onboarding for select
  to authenticated
  using (wh.is_member(household_id));

create policy household_onboarding_insert_admin
  on public.household_onboarding for insert
  to authenticated
  with check (wh.is_household_admin(household_id));

create policy household_onboarding_update_admin
  on public.household_onboarding for update
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

-- Onboarding events ---------------------------------------------------------

create table public.onboarding_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  event text not null check (event in (
    'onboarding_started', 'household_composition_completed', 'member_added', 'pet_added', 'helper_added',
    'responsibility_suggestions_generated', 'responsibility_accepted', 'responsibility_modified',
    'responsibility_rejected', 'ai_setup_started', 'ai_question_answered', 'setup_deferred',
    'setup_resumed', 'setup_completed', 'first_use_after_onboarding'
  )),
  step text check (step is null or length(step) <= 40),
  -- Counts and closed words only — never a name, an answer or anything said.
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object' and length(detail::text) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.onboarding_events is
  'What happened during setup, in closed words and counts. Measures effort; holds no household content.';

alter table public.onboarding_events enable row level security;

create index onboarding_events_household_idx on public.onboarding_events (household_id, created_at desc);

create policy onboarding_events_insert_admin
  on public.onboarding_events for insert
  to authenticated
  with check (wh.is_household_admin(household_id));

create policy onboarding_events_select_admin
  on public.onboarding_events for select
  to authenticated
  using (wh.is_household_admin(household_id));

-- An invitation that claims a member already on record ----------------------

alter table public.household_invitations
  add column member_id uuid references public.household_members(id) on delete set null;

comment on column public.household_invitations.member_id is
  'The member this invitation is for, when they were already added without a login. Accepting links the new account to that member instead of creating another.';

create or replace function wh.accept_invitation(p_token_hash text, p_display_name text default null)
returns table (household_id uuid, member_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_invitation public.household_invitations%rowtype;
  v_member_id uuid;
begin
  if v_profile_id is null then
    raise exception 'Authentication required to accept an invitation'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_invitation
  from public.household_invitations i
  where i.token_hash = p_token_hash
  for update;

  -- One message for every unusable token: an invalid token and a revoked one
  -- must be indistinguishable, or the endpoint becomes an oracle.
  if v_invitation.id is null
     or v_invitation.revoked_at is not null
     or v_invitation.accepted_at is not null
     or v_invitation.expires_at <= now() then
    raise exception 'This invitation is no longer valid'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Already a member of this household: accept idempotently rather than
  -- creating a second identity for the same person.
  select m.id into v_member_id
  from public.household_members m
  where m.household_id = v_invitation.household_id
    and m.profile_id = v_profile_id;

  if v_member_id is null then
    insert into public.profiles (id, display_name)
    values (v_profile_id, coalesce(p_display_name, v_invitation.display_name))
    on conflict (id) do nothing;

    -- The invitation names a member already on record without a login (an
    -- adult added during setup): the new account becomes that member.
    if v_invitation.member_id is not null then
      update public.household_members m
      set profile_id = v_profile_id
      where m.id = v_invitation.member_id
        and m.household_id = v_invitation.household_id
        and m.profile_id is null
        and m.status = 'active'
      returning m.id into v_member_id;
    end if;

    if v_member_id is null then
      insert into public.household_members (household_id, profile_id, member_type, display_name)
      values (
        v_invitation.household_id,
        v_profile_id,
        v_invitation.member_type,
        coalesce(p_display_name, v_invitation.display_name)
      )
      returning id into v_member_id;
    end if;

    insert into public.household_roles (household_id, member_id, role)
    values (v_invitation.household_id, v_member_id, v_invitation.role)
    on conflict do nothing;
  end if;

  update public.household_invitations
  set accepted_at = now(), accepted_member_id = v_member_id
  where id = v_invitation.id;

  insert into public.audit_events (
    household_id, actor_member_id, actor_profile_id, event_type, target_table, target_id, metadata
  )
  values (
    v_invitation.household_id, v_member_id, v_profile_id, 'invitation.accepted',
    'household_invitations', v_invitation.id,
    jsonb_build_object('role', v_invitation.role, 'claimed', v_invitation.member_id is not null)
  );

  return query select v_invitation.household_id, v_member_id;
end;
$$;

comment on function wh.accept_invitation(text, text) is
  'Validates an invitation token digest and creates the membership in one transaction — or, when the invitation names an unlinked member, links the new account to that member. The only path by which a non-member joins a household.';
