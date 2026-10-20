-- What a pet likes (the owner, 2026-10-20: "add like, dislikes, favourite food,
-- favourite places etc for pets").
--
-- One row per thing: its kind (a like, a dislike, a favourite food, treat,
-- place or toy, a fear, an allergy, or a kind the household names itself) and
-- what it is, with an optional note. Everyone in the household reads them;
-- an Admin adds, changes and removes them, as with the pet itself. HomeBrain
-- hears about every change like any domain table's.
--
-- Rollback: drop table public.pet_preferences;

create table if not exists public.pet_preferences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  kind text not null check (length(trim(kind)) between 1 and 40),
  subject text not null check (length(trim(subject)) between 1 and 120),
  note text check (note is null or length(trim(note)) <= 300),
  created_by uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pet_preferences is
  'What a pet likes and dislikes, its favourite food, treat, place and toy, its fears and allergies (the owner, 2026-10-20). Admins write; every member reads.';

create index if not exists pet_preferences_pet_idx on public.pet_preferences (pet_id);
create index if not exists pet_preferences_household_idx on public.pet_preferences (household_id);
create index if not exists pet_preferences_created_by_idx on public.pet_preferences (created_by);

create or replace trigger pet_preferences_set_updated_at
  before update on public.pet_preferences
  for each row execute function wh.set_updated_at();

alter table public.pet_preferences enable row level security;

drop policy if exists pet_preferences_read on public.pet_preferences;
create policy pet_preferences_read on public.pet_preferences for select
  to authenticated
  using (household_id in (select wh.member_households()));

drop policy if exists pet_preferences_write_admin on public.pet_preferences;
create policy pet_preferences_write_admin on public.pet_preferences for all
  to authenticated
  using (household_id in (select wh.admin_households()))
  with check (
    household_id in (select wh.admin_households())
    and exists (select 1 from public.pets p where p.id = pet_id and p.household_id = pet_preferences.household_id)
  );

grant select, insert, update, delete on public.pet_preferences to authenticated;

create or replace trigger pet_preferences_marks_context_stale
  after insert or update or delete on public.pet_preferences
  for each row execute function wh.mark_context_stale();

notify pgrst, 'reload schema';
