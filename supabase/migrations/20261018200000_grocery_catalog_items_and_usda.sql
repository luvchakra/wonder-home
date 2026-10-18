-- HomeFood 25-006: the grocery catalog becomes WonderHome's own, and USDA
-- foods get a place to link to it.
--
-- 1. WonderHome's curated items. Until now every catalog row was a packed
--    product from Open Food Facts. The catalog now also holds the generic
--    things a household buys ("Toor dal", "Bhindi (lady finger)", "Detergent
--    powder"), written by WonderHome, with the other names people type for
--    them (Hindi in both scripts, regional names, common spellings). A row's
--    `id` is its catalog id: stable, never a source's id, and what everything
--    else links to.
--      kind = 'item'     a generic thing WonderHome curated (source wonderhome)
--      kind = 'product'  a packed product from a source (Open Food Facts)
--    A product may later name the item it is (`item_id`); that linking is
--    reviewed work, so it starts empty.
--
-- 2. USDA FoodData Central foods (public domain), one row per food, carrying
--    the catalog id it belongs to. Linking a USDA food to a catalog item is a
--    research task done in phases (design/grocery-catalog/USDA_NUTRITION_MATCHING_STUDY.md):
--    a link is a candidate until a person approves it, and nothing a household
--    sees reads this table until then. Service role only.

alter table public.grocery_catalog drop constraint if exists grocery_catalog_source_check;
alter table public.grocery_catalog
  add constraint grocery_catalog_source_check check (source in ('wonderhome', 'open_food_facts', 'usda'));

alter table public.grocery_catalog
  add column kind text not null default 'product' check (kind in ('item', 'product')),
  add column item_id uuid references public.grocery_catalog (id) on delete set null,
  add column subcategory text check (subcategory is null or length(btrim(subcategory)) between 1 and 60),
  add column aliases text[] not null default '{}' check (cardinality(aliases) <= 30),
  add column is_food boolean not null default true,
  add column active boolean not null default true;

-- Only a product names the item it is, and never itself.
alter table public.grocery_catalog
  add constraint grocery_catalog_item_link check (item_id is null or (kind = 'product' and item_id <> id));

comment on column public.grocery_catalog.id is
  'The catalog id: WonderHome''s stable id for this entry. consumables.catalog_id and usda_foods.catalog_id point here.';
comment on column public.grocery_catalog.kind is
  '''item'': a generic thing WonderHome curated. ''product'': a packed product from a source, with its brand and pack.';
comment on column public.grocery_catalog.aliases is
  'Other names people type for it: spellings, Hindi in Latin and Devanagari, regional names. Searched with the name.';

create index grocery_catalog_kind_category on public.grocery_catalog (kind, category) where active;
create index grocery_catalog_item_id on public.grocery_catalog (item_id) where item_id is not null;

-- The quick search, ranked in the database so a broad word still finds the
-- best matches:
--   0  the name is the word, or begins with it as a whole word ("Atta, multigrain")
--   1  the name begins with it ("Attar")
--   2  a word of the name begins with it ("Potato chips")
--   3  another name has a word beginning with it ("arhar" for Toor dal)
--   4  it appears anywhere
-- then WonderHome's items before products, pictures first, the shortest name.
-- The caller passes the search words already lowercased (catalog.ts
-- `searchWords`); LIKE's wildcards are stripped from whatever arrives.
create or replace function public.search_grocery_catalog(p_query text, p_limit integer default 12)
returns setof public.grocery_catalog
language sql
stable
security invoker
set search_path = ''
as $$
  with needle as (
    select replace(replace(replace(lower(btrim(coalesce(p_query, ''))), '\', ''), '%', ''), '_', '') as q
  ), found as (
    select c, n.q, btrim(regexp_replace(lower(c.name), '[^[:alnum:]]+', ' ', 'g')) as name_words
    from public.grocery_catalog c, needle n
    where c.active
      and length(n.q) >= 2
      and c.search_text like '%' || n.q || '%'
  )
  select (f.c).*
  from found f
  order by
    case
      when f.name_words = f.q or f.name_words like f.q || ' %' then 0
      when f.name_words like f.q || '%' then 1
      when f.name_words like '% ' || f.q || '%' then 2
      when (f.c).search_text like '% ' || f.q || '%' then 3
      else 4
    end,
    ((f.c).kind = 'item') desc,
    ((f.c).image_path is not null) desc,
    length((f.c).name),
    (f.c).name
  limit least(greatest(coalesce(p_limit, 12), 1), 30);
$$;

revoke all on function public.search_grocery_catalog(text, integer) from public, anon;
grant execute on function public.search_grocery_catalog(text, integer) to authenticated;

create table public.usda_foods (
  fdc_id integer primary key check (fdc_id > 0),
  data_type text not null check (data_type in ('foundation', 'sr_legacy')),
  description text not null check (length(btrim(description)) between 1 and 300),
  food_category text check (food_category is null or length(food_category) between 1 and 120),
  -- The pinned release the values came from, e.g. 'SR Legacy 2018-04'.
  release text not null check (length(release) between 1 and 60),
  -- Per 100 g, as USDA states them. Keys as in grocery_catalog.nutrients; a
  -- missing key is unknown, never zero.
  nutrients jsonb not null default '{}'::jsonb check (jsonb_typeof(nutrients) = 'object'),
  -- The catalog entry this food describes. Linking is phased research: a link
  -- starts as a candidate and only a person approves it.
  catalog_id uuid references public.grocery_catalog (id) on delete set null,
  link_status text not null default 'unlinked'
    check (link_status in ('unlinked', 'candidate', 'approved', 'rejected')),
  match_type text check (match_type is null or match_type in ('exact', 'close', 'approximate')),
  link_note text check (link_note is null or length(link_note) <= 500),
  linked_at timestamptz,
  imported_at timestamptz not null default now(),
  constraint usda_foods_link_shape check ((catalog_id is null) = (link_status = 'unlinked'))
);

comment on table public.usda_foods is
  'HomeFood 25-006: USDA FoodData Central foods (Foundation, SR Legacy; public domain), each carrying the catalog id it is linked to. Linking is phased and reviewed; service role only.';

create index usda_foods_catalog_id on public.usda_foods (catalog_id) where catalog_id is not null;

alter table public.usda_foods enable row level security;
revoke all on public.usda_foods from anon, authenticated;
