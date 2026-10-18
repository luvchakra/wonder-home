-- HomeFood 25-010: a search that shows what a household means.
--
-- The owner, 2026-10-18: typing "eggs" should offer the eggs a household
-- actually buys (white, brown) and the brands on sale — not duck, quail,
-- organic and five other variants. Those stay findable by name ("duck eggs").
--
-- 1. `common`: WonderHome's curated mark for the everyday variant of a thing
--    (supabase/seed/grocery-catalog/items.csv). Search shows common items
--    first and only.
-- 2. Pictures for common items, from Wikimedia Commons, copied into
--    WonderHome's storage with their licence and author kept here, so the
--    credit is always shown where the picture is (CC BY / CC BY-SA require it).
-- 3. The search can be asked for items or for products, so each gets its own
--    share of the results.

alter table public.grocery_catalog
  add column common boolean not null default false,
  -- The amounts + and − step through (commerce/buying-sizes.ts), in the base
  -- unit (g, ml, or the counted unit): the packs a shop sells, or one at a
  -- time for anything counted. A packed product steps by its own pack.
  add column buy_sizes numeric[] check (buy_sizes is null or (cardinality(buy_sizes) between 1 and 30 and 0 < all(buy_sizes))),
  add column image_licence text check (image_licence is null or length(image_licence) <= 60),
  add column image_attribution text check (image_attribution is null or length(image_attribution) <= 200),
  add column image_source_url text check (image_source_url is null or image_source_url ~ '^https://');

comment on column public.grocery_catalog.common is
  'WonderHome''s mark for the everyday variant a household means by the word. Search shows these first; the rest when asked for by name.';

-- A packed product steps by its own pack: two packets, not 1.25 of one.
update public.grocery_catalog
set buy_sizes = array[pack_quantity * case pack_unit when 'kg' then 1000 when 'l' then 1000 else 1 end]
where kind = 'product' and pack_quantity is not null and pack_unit in ('g', 'kg', 'ml', 'l');

-- Ranked as before (25-006), now with the everyday variant first among equals,
-- and only items or only products. A new function beside the old one, so the
-- version of the app already deployed keeps searching until this one ships.
create or replace function public.search_grocery_catalog_kind(p_query text, p_limit integer, p_kind text)
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
      and c.kind = p_kind
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
    (f.c).common desc,
    ((f.c).kind = 'item') desc,
    ((f.c).image_path is not null) desc,
    length((f.c).name),
    (f.c).name
  limit least(greatest(coalesce(p_limit, 12), 1), 40);
$$;

revoke all on function public.search_grocery_catalog_kind(text, integer, text) from public, anon;
grant execute on function public.search_grocery_catalog_kind(text, integer, text) to authenticated;
