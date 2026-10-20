-- WonderHome's recipe catalog (backlog 25-022).
--
-- Everyday Indian dishes every household can browse, plan from and copy as
-- their own recipe. Platform data, like `grocery_catalog`: every signed-in
-- member reads it; only the server's seed (service role) writes it
-- (`scripts/recipe-catalog/seed.ts`). Steps are short and written for
-- WonderHome. Pictures are from Wikimedia Commons under a CC licence, copied
-- into the public "grocery-catalog" bucket under recipes/, with their author,
-- licence and file page kept beside them. Nutrients per serving are worked
-- out by the seed from the linked grocery items (IFCT 2017 where an item has
-- it), and say how many ingredients they were counted from.

create table public.recipe_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (length(trim(name)) between 1 and 120),
  region text check (region is null or length(trim(region)) <= 60),
  course text not null check (course in ('breakfast', 'main', 'side', 'rice', 'snack', 'sweet')),
  diet text not null default 'veg' check (diet in ('veg', 'egg', 'non_veg')),
  prep_minutes smallint not null check (prep_minutes between 0 and 600),
  cook_minutes smallint not null check (cook_minutes between 0 and 600),
  serves smallint not null check (serves between 1 and 20),
  description text check (description is null or length(trim(description)) <= 300),
  steps text[] not null check (cardinality(steps) between 1 and 12),
  tags text[] not null default '{}',
  image_path text check (image_path is null or length(image_path) <= 200),
  image_licence text check (image_licence is null or length(image_licence) <= 60),
  image_attribution text check (image_attribution is null or length(image_attribution) <= 160),
  image_source_url text check (image_source_url is null or image_source_url ~ '^https://commons\.wikimedia\.org/'),
  calories_per_serving integer check (calories_per_serving is null or calories_per_serving between 0 and 5000),
  protein_grams integer check (protein_grams is null or protein_grams between 0 and 500),
  carbs_grams integer check (carbs_grams is null or carbs_grams between 0 and 1000),
  fat_grams integer check (fat_grams is null or fat_grams between 0 and 500),
  nutrition_counted smallint check (nutrition_counted is null or nutrition_counted >= 0),
  nutrition_total smallint check (nutrition_total is null or nutrition_total >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.recipe_catalog is
  'Shared Indian recipes (25-022): read by every signed-in member, written only by the server''s seed. Pictures from Wikimedia Commons with credit; nutrients per serving from the linked grocery items.';

create trigger recipe_catalog_set_updated_at
  before update on public.recipe_catalog
  for each row execute function wh.set_updated_at();

create table public.recipe_catalog_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipe_catalog(id) on delete cascade,
  position smallint not null check (position between 0 and 60),
  name text not null check (length(trim(name)) between 1 and 120),
  quantity numeric(10, 2) not null check (quantity > 0),
  unit text not null check (length(trim(unit)) between 1 and 20),
  grocery_catalog_id uuid references public.grocery_catalog(id) on delete set null,
  note text check (note is null or length(trim(note)) <= 120),
  optional boolean not null default false,
  unique (recipe_id, position)
);

create index recipe_catalog_ingredients_recipe_idx on public.recipe_catalog_ingredients (recipe_id, position);
create index recipe_catalog_ingredients_item_idx on public.recipe_catalog_ingredients (grocery_catalog_id);

alter table public.recipe_catalog enable row level security;
alter table public.recipe_catalog_ingredients enable row level security;
create policy recipe_catalog_select_signed_in on public.recipe_catalog for select to authenticated using (true);
create policy recipe_catalog_ingredients_select_signed_in on public.recipe_catalog_ingredients for select to authenticated using (true);
revoke all on public.recipe_catalog, public.recipe_catalog_ingredients from anon, authenticated;
grant select on public.recipe_catalog, public.recipe_catalog_ingredients to authenticated;

-- A household's own recipe remembers the catalog dish it was saved from
-- ("save my version"), and can be retired without being deleted (rule 12):
-- meals that used it keep their history.
alter table public.recipes
  add column if not exists catalog_recipe_id uuid references public.recipe_catalog(id) on delete set null,
  add column if not exists active boolean not null default true;

create index if not exists recipes_catalog_recipe_idx on public.recipes (catalog_recipe_id);
create index if not exists recipes_household_active_idx on public.recipes (household_id) where active;

-- The household's unique name is only among its current recipes, so a
-- retired "Poha" never blocks saving a new one.
alter table public.recipes drop constraint if exists recipes_household_id_name_key;
create unique index if not exists recipes_household_name_active on public.recipes (household_id, lower(name)) where active;
