-- Meals and cooking (stories 10-001 through 10-008).
--
-- Applied to the wonder-home Supabase project as version 20260917163112.
--
-- A meal is a readiness outcome, not a checklist. Nobody records that the rice
-- went on; what matters is whether the family eats at the time they need to,
-- and that is what these tables model.
--
-- Two distinctions carry the module. Preferences record their scope and their
-- source, so "this household does not eat beef" and "Anaya does not like
-- mushrooms" can never be confused — treating an individual's dislike as a
-- household rule is how a planner quietly stops cooking anything anybody
-- enjoys. And a missing ingredient becomes a row in the shopping domain rather
-- than an informational note, because the criterion is explicit that it must
-- not be "a generic informational insight".

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  cuisine text check (length(trim(cuisine)) <= 60),
  -- Hands-on time and total time are different numbers and a plan needs both:
  -- a dish that simmers for an hour occupies the cook for ten minutes.
  active_minutes integer not null default 20 check (active_minutes between 1 and 600),
  total_minutes integer not null default 30 check (total_minutes between 1 and 1440),
  serves integer not null default 4 check (serves between 1 and 50),
  -- Steps as text, kept short on purpose. A recipe nobody can read while
  -- cooking is a recipe nobody uses.
  method text check (length(trim(method)) <= 4000),
  source text check (length(trim(source)) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipes_total_covers_active check (total_minutes >= active_minutes),
  unique (household_id, name)
);

comment on table public.recipes is
  'What the household can cook. Hands-on and total time are separate because a plan needs both.';

alter table public.recipes enable row level security;

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function wh.set_updated_at();

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  -- Linked to a consumable where the household tracks one, so a meal plan can
  -- turn straight into a shopping dependency rather than a shopping guess.
  consumable_id uuid references public.consumables(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit text not null default 'unit' check (length(trim(unit)) between 1 and 20),
  -- Some things a dish cannot be made without; others are garnish. The
  -- difference decides whether a shortage is a shopping trip or a shrug.
  essential boolean not null default true,
  created_at timestamptz not null default now(),
  unique (recipe_id, name)
);

comment on table public.recipe_ingredients is
  'What a dish needs. Essential ingredients become shopping dependencies; the rest are preferences.';

alter table public.recipe_ingredients enable row level security;

create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);

create table public.food_preferences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- Null means the whole household. A member id means this person only, and
  -- the two are never merged: an individual dislike is not a house rule.
  member_id uuid references public.household_members(id) on delete cascade,
  kind text not null check (kind in ('allergy', 'medical', 'ethical', 'dislike', 'preference')),
  subject text not null check (length(trim(subject)) between 1 and 120),
  -- Where this came from, so it can be explained and corrected later.
  source text not null default 'member_stated'
    check (source in ('member_stated', 'observed', 'imported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, member_id, subject)
);

comment on table public.food_preferences is
  'What the household or one person will not eat. Scope and source are kept so a dislike never becomes a house rule.';

alter table public.food_preferences enable row level security;

create index food_preferences_household_idx on public.food_preferences (household_id);

create trigger food_preferences_set_updated_at
  before update on public.food_preferences
  for each row execute function wh.set_updated_at();

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,
  -- Kept even when the recipe is deleted, so a past meal stays readable.
  name text not null check (length(trim(name)) between 1 and 160),
  slot text not null check (slot in ('breakfast', 'lunch', 'snack', 'dinner')),
  on_date date not null,
  -- When the family needs to eat, which is the outcome. Not when to start.
  ready_by timestamptz not null,
  cook_member_id uuid references public.household_members(id) on delete set null,
  status text not null default 'planned' check (status in
    ('planned', 'at_risk', 'ready', 'eaten', 'skipped', 'replanned')),
  -- Readiness is observed or confirmed, never demanded as a checklist step.
  ready_at timestamptz,
  readiness_source text check (readiness_source in ('member_confirmed', 'observed', 'inferred')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meals_readiness_has_source check ((ready_at is null) = (readiness_source is null)),
  constraint meals_ready_is_timed check (status not in ('ready', 'eaten') or ready_at is not null),
  unique (household_id, on_date, slot)
);

comment on table public.meals is
  'A meal as a readiness outcome: what the family eats and by when. There is no step anybody is asked to tick.';

alter table public.meals enable row level security;

create index meals_upcoming_idx on public.meals (household_id, ready_by)
  where status in ('planned', 'at_risk');

create trigger meals_set_updated_at
  before update on public.meals
  for each row execute function wh.set_updated_at();

create table public.meal_ingredient_needs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete cascade,
  consumable_id uuid references public.consumables(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  quantity numeric(10, 2) not null check (quantity > 0),
  unit text not null default 'unit',
  essential boolean not null default true,
  -- The link to the shopping domain. A shortage becomes a suggestion, not a
  -- note — which is the difference the acceptance criteria insist on.
  cart_suggestion_id uuid references public.cart_suggestions(id) on delete set null,
  status text not null default 'needed'
    check (status in ('needed', 'have', 'shopping', 'substituted', 'missing')),
  substitute_name text check (length(trim(substitute_name)) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_ingredient_needs_substitute_named check (
    status <> 'substituted' or substitute_name is not null
  ),
  unique (meal_id, name)
);

comment on table public.meal_ingredient_needs is
  'What a planned meal still needs. A shortage points at the shopping suggestion that resolves it.';

alter table public.meal_ingredient_needs enable row level security;

create index meal_ingredient_needs_open_idx on public.meal_ingredient_needs (household_id, meal_id)
  where status in ('needed', 'missing');

create trigger meal_ingredient_needs_set_updated_at
  before update on public.meal_ingredient_needs
  for each row execute function wh.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cross-table invariants
-- ---------------------------------------------------------------------------

create trigger recipe_ingredients_recipe_valid
  before insert or update on public.recipe_ingredients
  for each row execute function wh.assert_commerce_row_in_household('recipe_id', 'recipes');

create trigger recipe_ingredients_consumable_valid
  before insert or update on public.recipe_ingredients
  for each row execute function wh.assert_commerce_row_in_household('consumable_id', 'consumables');

create trigger meals_recipe_valid
  before insert or update on public.meals
  for each row execute function wh.assert_commerce_row_in_household('recipe_id', 'recipes');

create trigger meal_ingredient_needs_meal_valid
  before insert or update on public.meal_ingredient_needs
  for each row execute function wh.assert_commerce_row_in_household('meal_id', 'meals');

create trigger meal_ingredient_needs_consumable_valid
  before insert or update on public.meal_ingredient_needs
  for each row execute function wh.assert_commerce_row_in_household('consumable_id', 'consumables');

create or replace function wh.assert_meal_member_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_household uuid;
begin
  v_member := (to_jsonb(new) ->> tg_argv[0])::uuid;
  if v_member is null then
    return new;
  end if;

  select household_id into v_household from public.household_members where id = v_member;
  if v_household is distinct from new.household_id then
    raise exception 'Member % is not part of household %', v_member, new.household_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger meals_cook_valid
  before insert or update on public.meals
  for each row execute function wh.assert_meal_member_in_household('cook_member_id');

create trigger food_preferences_member_valid
  before insert or update on public.food_preferences
  for each row execute function wh.assert_meal_member_in_household('member_id');

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Food is shared. Everyone in the household reads and writes meals, recipes and
-- what they themselves will not eat — including children, because a child who
-- cannot record their own allergy is a child whose allergy WonderHome does not
-- know about.
--
-- The one narrowing: a member may only state a preference about themselves or
-- about the household, never about somebody else. "Priya does not like fish"
-- is Priya's to say.
-- ---------------------------------------------------------------------------

create policy recipes_select_member on public.recipes for select
  to authenticated using (wh.is_member(household_id));

create policy recipes_write_member on public.recipes for all
  to authenticated
  using (wh.is_member(household_id))
  with check (wh.is_member(household_id));

create policy recipe_ingredients_select_member on public.recipe_ingredients for select
  to authenticated using (wh.is_member(household_id));

create policy recipe_ingredients_write_member on public.recipe_ingredients for all
  to authenticated
  using (wh.is_member(household_id))
  with check (wh.is_member(household_id));

create policy food_preferences_select_member on public.food_preferences for select
  to authenticated using (wh.is_member(household_id));

create policy food_preferences_write_own on public.food_preferences for all
  to authenticated
  using (
    wh.is_member(household_id)
    and (member_id is null or member_id = wh.member_id(household_id) or wh.is_household_admin(household_id))
  )
  with check (
    wh.is_member(household_id)
    and (member_id is null or member_id = wh.member_id(household_id) or wh.is_household_admin(household_id))
  );

create policy meals_select_member on public.meals for select
  to authenticated using (wh.is_member(household_id));

create policy meals_write_member on public.meals for all
  to authenticated
  using (wh.is_member(household_id))
  with check (wh.is_member(household_id));

create policy meal_ingredient_needs_select_member on public.meal_ingredient_needs for select
  to authenticated using (wh.is_member(household_id));

create policy meal_ingredient_needs_write_member on public.meal_ingredient_needs for all
  to authenticated
  using (wh.is_member(household_id))
  with check (wh.is_member(household_id));

notify pgrst, 'reload schema';
