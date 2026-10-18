-- HomeFood 25-006: one grocery catalog every household shares.
--
-- A platform table, not a household's: the products, pack sizes, pictures
-- and nutrient values a quick search in "Add an item" shows. It is filled
-- only by the server's import (service role) from open data — Open Food
-- Facts (ODbL; pictures CC BY-SA, credited on every entry) and, once a key is
-- set, USDA FoodData Central (public domain). Nothing in it is invented: an
-- entry carries its source, the source's own id and licence, and when the
-- source last changed it.
--
-- A household's item stays its own row in `consumables`; picking a catalog
-- entry only links it (`consumables.catalog_id`), so a household's names,
-- amounts and history are never shared, and the catalog never learns what any
-- household keeps.

create table public.grocery_catalog (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('open_food_facts', 'usda')),
  source_id text not null check (length(source_id) between 1 and 64),
  name text not null check (length(btrim(name)) between 1 and 160),
  brand text check (brand is null or length(brand) between 1 and 120),
  category text not null check (length(category) between 1 and 40),
  -- The pack as sold, e.g. 500 g or 1 l, in the units module's keys.
  pack_quantity numeric(12, 3) check (pack_quantity is null or pack_quantity > 0),
  pack_unit text check (pack_unit is null or length(pack_unit) between 1 and 20),
  -- The unit a household would keep it in.
  unit text not null check (length(unit) between 1 and 20),
  barcode text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  -- A path in the public "grocery-catalog" bucket: the picture is copied in at
  -- import, so a household's browser never fetches from a third party.
  image_path text check (image_path is null or length(image_path) between 1 and 200),
  -- Per 100 g or 100 ml, as the source states them. Keys: energy_kcal,
  -- protein_g, carbohydrate_g, sugars_g, fat_g, saturated_fat_g, fibre_g,
  -- sodium_mg. A missing key is unknown, never zero.
  nutrients jsonb not null default '{}'::jsonb check (jsonb_typeof(nutrients) = 'object'),
  nutrient_basis text check (nutrient_basis is null or nutrient_basis in ('100g', '100ml')),
  licence text not null check (length(licence) between 1 and 80),
  attribution text not null check (length(attribution) between 1 and 200),
  source_url text check (source_url is null or source_url ~ '^https://'),
  -- Lowercased name, brand and other names, for the quick search.
  search_text text not null,
  countries text[] not null default '{}',
  source_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  unique (source, source_id)
);

comment on table public.grocery_catalog is
  'HomeFood 25-006: the shared grocery catalog — products, pack sizes, pictures and nutrients from open data, filled only by the server''s import. Every signed-in member reads it; no household writes it.';

create index grocery_catalog_search on public.grocery_catalog using gin (to_tsvector('simple', search_text));
create index grocery_catalog_search_prefix on public.grocery_catalog (search_text text_pattern_ops);

alter table public.grocery_catalog enable row level security;

create policy grocery_catalog_select_signed_in on public.grocery_catalog for select
  to authenticated using (true);

revoke all on public.grocery_catalog from anon, authenticated;
grant select on public.grocery_catalog to authenticated;

-- A household's item, linked to the catalog entry it was picked from.
alter table public.consumables
  add column catalog_id uuid references public.grocery_catalog (id) on delete set null;

create index consumables_catalog_id on public.consumables (catalog_id) where catalog_id is not null;

-- The pictures: public to read (they are the source's own published photos,
-- credited), written only by the service role's import.
insert into storage.buckets (id, name, public)
values ('grocery-catalog', 'grocery-catalog', true)
on conflict (id) do nothing;
