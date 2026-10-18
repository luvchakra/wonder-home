-- HomeFood 25-009: Indian nutrition for the grocery catalog, from IFCT 2017.
--
-- India's own food composition table — Indian Food Composition Tables 2017,
-- T. Longvah, R. Ananthan, K. Bhaskarachary and K. Venkaiah, ICMR–National
-- Institute of Nutrition, Hyderabad — measured from regional samples of 528
-- key Indian foods (542 entries). It describes paneer, jaggery, ragi, Indian
-- dals and gourds the way an Indian kitchen buys them, which USDA does not.
--
-- Rights: the book encourages use of its data but asks for NIN's written
-- permission to store it electronically for a product. The owner decided on
-- 2026-10-18 to load it now, credited to ICMR–NIN on every value shown, and to
-- request that permission in parallel (docs/progress/2026-10-18-ifct-indian-nutrition.md).
--
-- Shape: one row per IFCT food (`ifct_foods`), and on the catalog side the
-- IFCT food a curated item is (`grocery_catalog.ifct_code`). The link lives on
-- the catalog because one IFCT food is often several catalog items (Toor dal,
-- Toor dal oily and Toor dal unpolished are all IFCT's red gram dal). Every
-- link comes from WonderHome's curated mapping
-- (supabase/seed/grocery-catalog/ifct-links.csv), reviewed in its pull
-- request, and says how close it is.

create table public.ifct_foods (
  code text primary key check (code ~ '^[A-T][0-9]{3}$'),
  name text not null check (length(btrim(name)) between 1 and 200),
  scientific_name text check (scientific_name is null or length(scientific_name) <= 200),
  food_group text not null check (length(food_group) between 1 and 80),
  local_names text check (local_names is null or length(local_names) <= 2000),
  release text not null default 'IFCT 2017' check (length(release) between 1 and 40),
  -- Per 100 g edible portion, as the table states them. Keys: energy_kcal,
  -- protein_g, carbohydrate_g, sugars_g, fat_g, saturated_fat_g, fibre_g,
  -- sodium_mg, calcium_mg, iron_mg, potassium_mg, zinc_mg, vitamin_c_mg,
  -- folate_ug. A missing key is unknown, never zero.
  nutrients jsonb not null default '{}'::jsonb check (jsonb_typeof(nutrients) = 'object'),
  -- 'stated': the table's own energy. 'computed': the table gives none (its
  -- oils) or a figure its own protein, fat, carbohydrate and fibre contradict
  -- by more than half, so energy is computed from those with IFCT's factors.
  energy_basis text not null default 'stated' check (energy_basis in ('stated', 'computed')),
  imported_at timestamptz not null default now()
);

comment on table public.ifct_foods is
  'HomeFood 25-009: Indian Food Composition Tables 2017 (ICMR–NIN), per 100 g edible portion. Reference data every signed-in member reads; written only by the server''s loader. Credited to ICMR–NIN wherever shown.';

alter table public.ifct_foods enable row level security;

create policy ifct_foods_select_signed_in on public.ifct_foods for select
  to authenticated using (true);

revoke all on public.ifct_foods from anon, authenticated;
grant select on public.ifct_foods to authenticated;

alter table public.grocery_catalog
  add column ifct_code text references public.ifct_foods (code),
  add column ifct_match text check (ifct_match is null or ifct_match in ('exact', 'close', 'approximate')),
  add column ifct_note text check (ifct_note is null or length(ifct_note) <= 300);

-- A link always says how close it is, and only a curated item has one: a
-- packed product carries its own label.
alter table public.grocery_catalog
  add constraint grocery_catalog_ifct_link check (
    (ifct_code is null) = (ifct_match is null)
    and (ifct_code is null or kind = 'item')
  );

comment on column public.grocery_catalog.ifct_code is
  'The IFCT 2017 food this curated item is (from supabase/seed/grocery-catalog/ifct-links.csv). One IFCT food may be several items.';

create index grocery_catalog_ifct_code on public.grocery_catalog (ifct_code) where ifct_code is not null;
