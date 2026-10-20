-- The week template (the owner, 2026-10-20: "create a week template with
-- multiple options per slot. for each week let WonderHome select the weekly
-- meal plan and show to you, if required user can make change or its accepted
-- by default").
--
-- `meal_week_template_options`: for a weekday (1 = Monday … 7 = Sunday) and a
-- slot, the household's recipes that may go there — several per slot. Every
-- member reads it; an adult (Admins are adults) adds, changes and removes.
--
-- `meal_week_plans`: one row per household and week once WonderHome has
-- filled that week from the template, so a week is filled once and a meal a
-- person removed afterwards is not put back.
--
-- `meals.origin`: 'week_template' for a meal WonderHome picked, 'person' for
-- every other one. A person changing a picked meal makes it theirs.
--
-- Rollback: drop table public.meal_week_plans; drop table public.meal_week_template_options;
-- alter table public.meals drop column origin;

create table if not exists public.meal_week_template_options (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  slot text not null check (slot in ('breakfast', 'lunch', 'snack', 'dinner')),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  position integer not null default 0,
  created_by uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, weekday, slot, recipe_id)
);

comment on table public.meal_week_template_options is
  'The week template: recipes that may fill a weekday''s slot, several per slot. WonderHome picks one each week (the owner, 2026-10-20). Adults write; every member reads.';

create index if not exists meal_week_template_options_recipe_idx on public.meal_week_template_options (recipe_id);
create index if not exists meal_week_template_options_created_by_idx on public.meal_week_template_options (created_by);

create or replace trigger meal_week_template_options_set_updated_at
  before update on public.meal_week_template_options
  for each row execute function wh.set_updated_at();

create or replace trigger meal_week_template_options_recipe_valid
  before insert or update on public.meal_week_template_options
  for each row execute function wh.assert_commerce_row_in_household('recipe_id', 'recipes');

alter table public.meal_week_template_options enable row level security;

drop policy if exists meal_week_template_options_read on public.meal_week_template_options;
create policy meal_week_template_options_read on public.meal_week_template_options for select
  to authenticated
  using (household_id in (select wh.member_households()));

drop policy if exists meal_week_template_options_write_adult on public.meal_week_template_options;
create policy meal_week_template_options_write_adult on public.meal_week_template_options for all
  to authenticated
  using (
    household_id in (
      select m.household_id from public.household_members m
      where m.profile_id = (select auth.uid()) and m.status = 'active' and m.member_type = 'adult'
    )
  )
  with check (
    household_id in (
      select m.household_id from public.household_members m
      where m.profile_id = (select auth.uid()) and m.status = 'active' and m.member_type = 'adult'
    )
  );

grant select, insert, update, delete on public.meal_week_template_options to authenticated;

create or replace trigger meal_week_template_options_marks_context_stale
  after insert or update or delete on public.meal_week_template_options
  for each row execute function wh.mark_context_stale();

create table if not exists public.meal_week_plans (
  household_id uuid not null references public.households(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  planned integer not null default 0 check (planned >= 0),
  generated_by uuid references public.household_members(id) on delete set null,
  generated_at timestamptz not null default now(),
  primary key (household_id, week_start)
);

comment on table public.meal_week_plans is
  'A week WonderHome has filled from the week template, once, so a meal removed afterwards is not put back.';

create index if not exists meal_week_plans_generated_by_idx on public.meal_week_plans (generated_by);

alter table public.meal_week_plans enable row level security;

drop policy if exists meal_week_plans_read on public.meal_week_plans;
create policy meal_week_plans_read on public.meal_week_plans for select
  to authenticated
  using (household_id in (select wh.member_households()));

drop policy if exists meal_week_plans_write_adult on public.meal_week_plans;
create policy meal_week_plans_write_adult on public.meal_week_plans for all
  to authenticated
  using (
    household_id in (
      select m.household_id from public.household_members m
      where m.profile_id = (select auth.uid()) and m.status = 'active' and m.member_type = 'adult'
    )
  )
  with check (
    household_id in (
      select m.household_id from public.household_members m
      where m.profile_id = (select auth.uid()) and m.status = 'active' and m.member_type = 'adult'
    )
  );

grant select, insert, update, delete on public.meal_week_plans to authenticated;

alter table public.meals
  add column if not exists origin text not null default 'person' check (origin in ('person', 'week_template'));

comment on column public.meals.origin is
  '''week_template'' when WonderHome picked it from the week template; ''person'' otherwise, including once a person changes it.';

notify pgrst, 'reload schema';
