-- HomeFood 25-031: USDA nutrition for the curated items IFCT 2017 does not list.
--
-- IFCT 2017 (25-009) describes Indian foods but has no curd, butter, cream,
-- sugar, coconut milk or most whole spices, so dishes made with them fell
-- under the 80% weight coverage recipe nutrition needs. The owner decided on
-- 2026-10-21 to use USDA FoodData Central (SR Legacy, public domain) for them.
--
-- Shape: as for IFCT, the link lives on the catalog side
-- (`grocery_catalog.usda_fdc_id`), because one USDA food is often several
-- catalog items (granulated sugar is Sugar, Caster sugar and Sugar cubes).
-- Every link comes from WonderHome's curated mapping
-- (supabase/seed/grocery-catalog/usda-links.csv), reviewed in its pull
-- request, and says how close it is. IFCT, where an item has it, comes first.
--
-- `usda_foods.catalog_id` / `link_status` stay for candidate research; they no
-- longer decide what a member sees.

alter table public.grocery_catalog
  add column usda_fdc_id integer,
  add column usda_match text check (usda_match is null or usda_match in ('exact', 'close', 'approximate')),
  add column usda_note text check (usda_note is null or length(usda_note) <= 300),
  add constraint grocery_catalog_usda_fdc_id_fkey foreign key (usda_fdc_id) references public.usda_foods (fdc_id);

-- A link always says how close it is, and only a curated item has one: a
-- packed product carries its own label.
alter table public.grocery_catalog
  add constraint grocery_catalog_usda_link check (
    (usda_fdc_id is null) = (usda_match is null)
    and (usda_fdc_id is null or kind = 'item')
  );

comment on column public.grocery_catalog.usda_fdc_id is
  'The USDA FoodData Central (SR Legacy) food this curated item is, from supabase/seed/grocery-catalog/usda-links.csv. Read only where the item has no IFCT 2017 link.';

create index grocery_catalog_usda_fdc_id on public.grocery_catalog (usda_fdc_id) where usda_fdc_id is not null;

-- A member reads a USDA food only once a curated item links to it: reviewed
-- reference data, public domain. Unlinked research rows stay the server's.
create policy usda_foods_select_linked on public.usda_foods for select
  to authenticated
  using (fdc_id in (select usda_fdc_id from public.grocery_catalog where usda_fdc_id is not null));

grant select on public.usda_foods to authenticated;

comment on table public.usda_foods is
  'HomeFood 25-006/25-031: USDA FoodData Central foods (SR Legacy; public domain), per 100 g. A signed-in member reads a food once a curated item links to it (grocery_catalog.usda_fdc_id); written only by the server''s loader. Credited to USDA wherever shown.';
