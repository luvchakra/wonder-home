-- Household certification (stories 05-001 through 05-007).
--
-- Applied to the wonder-home Supabase project as version 20260917022046.
--
-- The family's answer to "what does WonderHome think it knows about us?" and,
-- just as importantly, "why does it think that?". Every item names its source,
-- so a belief can always be traced back to setup, something said, a connected
-- account, or a pattern the system noticed.
--
-- certification_items is a view of household memory phrased for people, not a
-- second copy of it: memory_id points back at the belief it presents, so
-- correcting an item and correcting what the system acts on are the same act.

create table public.certification_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  memory_id uuid references public.memories(id) on delete cascade,
  category text not null check (category in
    ('family_roles', 'home_routines', 'education', 'finance', 'lifestyle', 'safety')),
  -- Phrased as a sentence a family can agree or disagree with, not as a key.
  claim text not null check (length(trim(claim)) between 1 and 300),
  scope text not null default 'household' check (scope in ('household', 'member')),
  member_id uuid references public.household_members(id) on delete cascade,
  source_type text not null check (source_type in ('setup', 'conversation', 'integration', 'observed')),
  source_detail text,
  status text not null default 'learned'
    check (status in ('learned', 'confirmed', 'needs_review', 'corrected', 'removed')),
  -- Risk is about the subject, not the system's confidence: being wrong about a
  -- payment limit is expensive however sure we were.
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'critical')),
  last_reviewed_at timestamptz,
  last_reviewed_by uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.certification_items is
  'What WonderHome believes, phrased so a family can check it. Every item names its source, so "why do you think that?" always has an answer.';

alter table public.certification_items enable row level security;

create index certification_items_open_idx on public.certification_items (household_id, risk_level, status)
  where status in ('learned', 'needs_review');
create index certification_items_memory_idx on public.certification_items (memory_id);

create trigger certification_items_set_updated_at
  before update on public.certification_items
  for each row execute function wh.set_updated_at();

create table public.certification_reviews (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  item_id uuid not null references public.certification_items(id) on delete cascade,
  reviewer_member_id uuid not null references public.household_members(id) on delete cascade,
  decision text not null check (decision in ('confirmed', 'corrected', 'removed', 'deferred')),
  previous_value jsonb,
  new_value jsonb,
  note text check (length(trim(note)) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.certification_reviews is
  'Who decided what about a belief, and when. Append-only: a correction adds a row rather than rewriting the last one.';

alter table public.certification_reviews enable row level security;

create index certification_reviews_item_idx on public.certification_reviews (item_id, created_at desc);

create or replace function wh.assert_certification_member_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  if (new.scope = 'member') <> (new.member_id is not null) then
    raise exception 'A member-scoped item needs a member, and a household item must not have one'
      using errcode = 'check_violation';
  end if;

  if new.member_id is not null then
    select household_id into v_household from public.household_members where id = new.member_id;
    if v_household is distinct from new.household_id then
      raise exception 'Member % is not part of household %', new.member_id, new.household_id
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger certification_items_scope_valid
  before insert or update on public.certification_items
  for each row execute function wh.assert_certification_member_scope();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Read-only from the client. Reviews are recorded server-side so that the
-- reviewer's identity is the authenticated member rather than whatever the
-- request claimed, and so an authorization check cannot be skipped by writing
-- to the table directly.
-- ---------------------------------------------------------------------------

create policy certification_items_select_member
  on public.certification_items for select
  to authenticated
  using (
    wh.is_member(household_id)
    and (scope = 'household' or member_id = wh.member_id(household_id) or wh.is_household_admin(household_id))
  );

-- The review history is visible to the whole household on purpose: a family
-- should be able to see who changed what WonderHome believes about them.
create policy certification_reviews_select_member
  on public.certification_reviews for select
  to authenticated
  using (wh.is_member(household_id));

notify pgrst, 'reload schema';
