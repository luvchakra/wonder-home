-- Groceries Phase 1: what is at home, and what to buy
-- (design/GROCERIES-PANTRY-HOMETALK-PHASE0.md §4, approved 2026-10-17).
--
-- Until now WonderHome kept no pantry: an item had a consumption rate and the
-- evidence for it, and "runs out on" was an estimate. The household asked for
-- the amount at home and the amount to buy as two separate, real numbers.
-- This adds them without replacing anything:
--
--   * `consumables` stays the one identity of an item, and gains what the
--     list needs: a preferred unit (`unit`, now normalised), a step, a low
--     level, where it is kept, aliases, a note and a photo.
--   * `inventory_balances`: one row per item — how much is at home, in the
--     base unit of its dimension (g, ml, pcs, or the item's own word), who
--     confirmed it and when, where that number came from, and a version for
--     concurrent edits. A balance that was never confirmed has no row, and the
--     product says "Unknown" — it never guesses.
--   * `inventory_events`: every change to a balance, append-only, with its
--     idempotency key — the history and the undo.
--   * `shopping_list_entries`: what to buy. At most one open ("to_buy") entry
--     per item, so adding the same thing twice combines the amounts.
--   * `shopping_list_events`: every change to the list, append-only.
--
-- All writes to the four new tables go through three SECURITY DEFINER
-- functions, `public.apply_inventory_change`, `public.adjust_shopping_entry`
-- and `public.mark_bought`. They do the arithmetic and the checks in one
-- statement each: never below zero, the version a screen read, and the
-- idempotency key a retry carries. Sessions have SELECT only. The amounts
-- arrive already in base units — `commerce/units.ts` converts, the database
-- refuses a unit that does not match the item's.
--
-- Who may write (owner decision D5): adults and Admins change stock; adults,
-- Admins and children add to the list; helpers read.
--
-- Groceries becomes part of every plan (owner decision D3): a new feature
-- `groceries.core` on free, pro and max. Ordering stays `commerce.orders`.

-- ---------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------

update public.consumables
set unit = case lower(trim(unit))
  when 'unit' then 'pcs' when 'units' then 'pcs' when 'item' then 'pcs' when 'items' then 'pcs'
  when 'piece' then 'pcs' when 'pieces' then 'pcs' when 'pc' then 'pcs'
  when 'litre' then 'l' when 'litres' then 'l' when 'liter' then 'l' when 'liters' then 'l' when 'ltr' then 'l'
  when 'gram' then 'g' when 'grams' then 'g' when 'gm' then 'g'
  when 'kilo' then 'kg' when 'kgs' then 'kg'
  else lower(trim(unit))
end;

alter table public.consumables alter column unit set default 'pcs';

alter table public.consumables
  add column step numeric(10,3) check (step is null or step > 0),
  add column low_level numeric(12,3) check (low_level is null or low_level >= 0),
  add column storage text check (storage is null or storage in ('fridge', 'freezer', 'pantry', 'other')),
  add column note text check (note is null or length(note) <= 300),
  add column aliases text[] not null default '{}' check (cardinality(aliases) <= 10),
  add column image_path text check (image_path is null or length(image_path) between 1 and 300);

comment on column public.consumables.unit is 'Preferred unit, normalised by commerce/units.ts: g, kg, ml, l, pcs, dozen, or the household''s own word.';
comment on column public.consumables.step is 'One step of the to-buy stepper, in the preferred unit. Null: the unit''s usual step.';
comment on column public.consumables.low_level is 'At or below this much at home (base units) the item reads as low. Null: no level set.';
comment on column public.consumables.image_path is 'Storage path in the private avatars bucket (<household>/groceries/<id>), or null. Never a URL.';

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------

create table public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  consumable_id uuid not null unique references public.consumables(id) on delete cascade,
  quantity numeric(12,3) not null check (quantity >= 0),
  unit text not null check (length(unit) between 1 and 20),
  confirmed_at timestamptz not null default now(),
  confirmed_by_member_id uuid references public.household_members(id) on delete set null,
  source text not null check (source in ('stated', 'purchase', 'consumption', 'correction', 'receipt', 'undo')),
  use_by date,
  use_by_basis text check (use_by_basis in ('printed', 'entered', 'estimated')),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint inventory_balances_use_by_has_basis check ((use_by is null) = (use_by_basis is null))
);

comment on table public.inventory_balances is
  'How much of an item is at home, in base units, with who confirmed it and when. No row: unknown, never guessed.';

create index inventory_balances_household on public.inventory_balances (household_id);

create table public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  consumable_id uuid not null references public.consumables(id) on delete cascade,
  kind text not null check (kind in ('set', 'add', 'use', 'undo')),
  delta numeric(12,3) not null,
  before_quantity numeric(12,3),
  after_quantity numeric(12,3) not null check (after_quantity >= 0),
  unit text not null,
  clamped boolean not null default false,
  source text not null,
  actor_member_id uuid references public.household_members(id) on delete set null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 120),
  source_ref jsonb not null default '{}'::jsonb,
  undone_by uuid references public.inventory_events(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, idempotency_key)
);

comment on table public.inventory_events is 'Every change to an inventory balance, append-only: the history and the undo.';

create index inventory_events_item on public.inventory_events (consumable_id, created_at desc);

-- ---------------------------------------------------------------------------
-- The list
-- ---------------------------------------------------------------------------

create table public.shopping_list_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  consumable_id uuid not null references public.consumables(id) on delete cascade,
  quantity numeric(12,3) not null check (quantity >= 0),
  unit text not null check (length(unit) between 1 and 20),
  state text not null default 'to_buy' check (state in ('to_buy', 'bought', 'removed')),
  source text not null check (source in ('manual', 'hometalk', 'meal', 'suggestion', 'receipt', 'agent', 'partner')),
  meal_id uuid references public.meals(id) on delete set null,
  created_by_member_id uuid references public.household_members(id) on delete set null,
  bought_purchase_id uuid references public.consumable_purchases(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint shopping_list_entries_open_is_positive check (state <> 'to_buy' or quantity > 0)
);

comment on table public.shopping_list_entries is
  'What to buy, in base units. One open (to_buy) entry per item; adding again combines.';

create unique index shopping_list_entries_one_open on public.shopping_list_entries (household_id, consumable_id) where state = 'to_buy';
create index shopping_list_entries_household on public.shopping_list_entries (household_id, state, updated_at desc);

create table public.shopping_list_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  entry_id uuid not null references public.shopping_list_entries(id) on delete cascade,
  consumable_id uuid not null references public.consumables(id) on delete cascade,
  kind text not null check (kind in ('add', 'subtract', 'set', 'remove', 'bought', 'undo')),
  delta numeric(12,3) not null,
  before_quantity numeric(12,3) not null,
  after_quantity numeric(12,3) not null check (after_quantity >= 0),
  unit text not null,
  source text not null,
  actor_member_id uuid references public.household_members(id) on delete set null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 120),
  created_at timestamptz not null default now(),
  unique (household_id, idempotency_key)
);

comment on table public.shopping_list_events is 'Every change to the shopping list, append-only.';

create index shopping_list_events_entry on public.shopping_list_events (entry_id, created_at desc);

-- Purchases now say what unit they were in, which list entry they closed, and
-- a use-by date where one was printed or entered.
alter table public.consumable_purchases
  add column unit text check (unit is null or length(unit) between 1 and 20),
  add column shopping_entry_id uuid references public.shopping_list_entries(id) on delete set null,
  add column best_before date,
  add column expiry_basis text check (expiry_basis in ('printed', 'entered', 'estimated')),
  add constraint consumable_purchases_expiry_has_basis check ((best_before is null) = (expiry_basis is null));

-- ---------------------------------------------------------------------------
-- Same-household guards (every reference must be the row's own household)
-- ---------------------------------------------------------------------------

create or replace function wh.assert_grocery_row_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.consumables c where c.id = new.consumable_id and c.household_id = new.household_id) then
    raise exception 'item is not in this household' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger inventory_balances_same_household before insert or update on public.inventory_balances
  for each row execute function wh.assert_grocery_row_in_household();
create trigger inventory_events_same_household before insert on public.inventory_events
  for each row execute function wh.assert_grocery_row_in_household();
create trigger shopping_list_entries_same_household before insert or update on public.shopping_list_entries
  for each row execute function wh.assert_grocery_row_in_household();
create trigger shopping_list_events_same_household before insert on public.shopping_list_events
  for each row execute function wh.assert_grocery_row_in_household();

-- ---------------------------------------------------------------------------
-- RLS: members read; nobody writes directly — the functions below do.
-- ---------------------------------------------------------------------------

alter table public.inventory_balances enable row level security;
alter table public.inventory_events enable row level security;
alter table public.shopping_list_entries enable row level security;
alter table public.shopping_list_events enable row level security;

create policy inventory_balances_select_member on public.inventory_balances for select
  to authenticated using (wh.is_member(household_id));
create policy inventory_events_select_member on public.inventory_events for select
  to authenticated using (wh.is_member(household_id));
create policy shopping_list_entries_select_member on public.shopping_list_entries for select
  to authenticated using (wh.is_member(household_id));
create policy shopping_list_events_select_member on public.shopping_list_events for select
  to authenticated using (wh.is_member(household_id));

-- ---------------------------------------------------------------------------
-- Writers
-- ---------------------------------------------------------------------------

-- Changing how much is at home: set it, add to it, or use some.
-- Returns {before, after, unit, version, clamped, replayed} — or {conflict:
-- true, version, after} when the caller read an older version.
create or replace function public.apply_inventory_change(
  p_household_id uuid,
  p_consumable_id uuid,
  p_kind text,
  p_quantity numeric,
  p_unit text,
  p_source text,
  p_idempotency_key text,
  p_expected_version integer default null,
  p_source_ref jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid := wh.member_id(p_household_id);
  v_balance public.inventory_balances%rowtype;
  v_before numeric;
  v_after numeric;
  v_clamped boolean := false;
  v_existing public.inventory_events%rowtype;
begin
  if not wh.has_role(p_household_id, array['head', 'administrator', 'adult']) then
    raise exception 'only adults change what is at home' using errcode = '42501';
  end if;
  if p_kind not in ('set', 'add', 'use') or p_quantity is null or p_quantity < 0 then
    raise exception 'not a stock change' using errcode = '22023';
  end if;
  if not exists (select 1 from public.consumables c where c.id = p_consumable_id and c.household_id = p_household_id and c.active) then
    raise exception 'item is not in this household' using errcode = '23514';
  end if;

  select * into v_existing from public.inventory_events
  where household_id = p_household_id and idempotency_key = p_idempotency_key;
  if found then
    select * into v_balance from public.inventory_balances where consumable_id = v_existing.consumable_id;
    return jsonb_build_object('before', v_existing.before_quantity, 'after', v_existing.after_quantity, 'unit', v_existing.unit,
      'version', coalesce(v_balance.version, 0), 'clamped', v_existing.clamped, 'replayed', true);
  end if;

  select * into v_balance from public.inventory_balances where consumable_id = p_consumable_id for update;

  if found and p_expected_version is not null and v_balance.version <> p_expected_version then
    return jsonb_build_object('conflict', true, 'version', v_balance.version, 'after', v_balance.quantity, 'unit', v_balance.unit);
  end if;
  if found and v_balance.unit <> p_unit then
    raise exception 'unit does not match this item' using errcode = '22023';
  end if;

  v_before := case when found then v_balance.quantity else null end;
  if p_kind = 'set' then
    v_after := p_quantity;
  elsif p_kind = 'add' then
    v_after := coalesce(v_before, 0) + p_quantity;
  else
    v_after := coalesce(v_before, 0) - p_quantity;
    if v_after < 0 then
      v_after := 0;
      v_clamped := true;
    end if;
  end if;

  if v_before is null then
    insert into public.inventory_balances (household_id, consumable_id, quantity, unit, confirmed_by_member_id, source)
    values (p_household_id, p_consumable_id, v_after, p_unit, v_member, p_source)
    returning * into v_balance;
  else
    update public.inventory_balances
    set quantity = v_after, confirmed_at = now(), confirmed_by_member_id = v_member, source = p_source,
        version = version + 1, updated_at = now()
    where id = v_balance.id
    returning * into v_balance;
  end if;

  insert into public.inventory_events (household_id, consumable_id, kind, delta, before_quantity, after_quantity, unit, clamped, source, actor_member_id, idempotency_key, source_ref)
  values (p_household_id, p_consumable_id, p_kind, v_after - coalesce(v_before, 0), v_before, v_after, p_unit, v_clamped, p_source, v_member, p_idempotency_key, coalesce(p_source_ref, '{}'::jsonb));

  return jsonb_build_object('before', v_before, 'after', v_after, 'unit', p_unit, 'version', v_balance.version, 'clamped', v_clamped, 'replayed', false);
end;
$$;

-- Changing what to buy: add to it, take some off, set it, or remove it.
-- Combines into the one open entry; reaching zero removes the entry.
create or replace function public.adjust_shopping_entry(
  p_household_id uuid,
  p_consumable_id uuid,
  p_kind text,
  p_quantity numeric,
  p_unit text,
  p_source text,
  p_idempotency_key text,
  p_expected_version integer default null,
  p_meal_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid := wh.member_id(p_household_id);
  v_entry public.shopping_list_entries%rowtype;
  v_before numeric;
  v_after numeric;
  v_existing public.shopping_list_events%rowtype;
begin
  if not wh.has_role(p_household_id, array['head', 'administrator', 'adult', 'child']) then
    raise exception 'helpers read the list; the family changes it' using errcode = '42501';
  end if;
  if p_kind not in ('add', 'subtract', 'set', 'remove') or (p_kind <> 'remove' and (p_quantity is null or p_quantity < 0)) then
    raise exception 'not a list change' using errcode = '22023';
  end if;
  if not exists (select 1 from public.consumables c where c.id = p_consumable_id and c.household_id = p_household_id and c.active) then
    raise exception 'item is not in this household' using errcode = '23514';
  end if;
  if p_meal_id is not null and not exists (select 1 from public.meals m where m.id = p_meal_id and m.household_id = p_household_id) then
    raise exception 'meal is not in this household' using errcode = '23514';
  end if;

  select * into v_existing from public.shopping_list_events
  where household_id = p_household_id and idempotency_key = p_idempotency_key;
  if found then
    select * into v_entry from public.shopping_list_entries where id = v_existing.entry_id;
    return jsonb_build_object('entryId', v_existing.entry_id, 'before', v_existing.before_quantity, 'after', v_existing.after_quantity,
      'unit', v_existing.unit, 'version', v_entry.version, 'replayed', true);
  end if;

  select * into v_entry from public.shopping_list_entries
  where household_id = p_household_id and consumable_id = p_consumable_id and state = 'to_buy'
  for update;

  if found and p_expected_version is not null and v_entry.version <> p_expected_version then
    return jsonb_build_object('conflict', true, 'entryId', v_entry.id, 'version', v_entry.version, 'after', v_entry.quantity, 'unit', v_entry.unit);
  end if;
  if found and v_entry.unit <> p_unit and p_kind <> 'remove' then
    raise exception 'unit does not match this item' using errcode = '22023';
  end if;

  v_before := case when found then v_entry.quantity else 0 end;
  v_after := case p_kind
    when 'add' then v_before + p_quantity
    when 'subtract' then greatest(v_before - p_quantity, 0)
    when 'set' then p_quantity
    else 0
  end;

  if v_entry.id is null then
    if v_after = 0 then
      return jsonb_build_object('entryId', null, 'before', 0, 'after', 0, 'unit', p_unit, 'version', 0, 'replayed', false);
    end if;
    insert into public.shopping_list_entries (household_id, consumable_id, quantity, unit, source, meal_id, created_by_member_id)
    values (p_household_id, p_consumable_id, v_after, p_unit, p_source, p_meal_id, v_member)
    returning * into v_entry;
  elsif v_after = 0 then
    update public.shopping_list_entries
    set quantity = 0, state = 'removed', closed_at = now(), version = version + 1, updated_at = now()
    where id = v_entry.id
    returning * into v_entry;
  else
    update public.shopping_list_entries
    set quantity = v_after, meal_id = coalesce(p_meal_id, meal_id), version = version + 1, updated_at = now()
    where id = v_entry.id
    returning * into v_entry;
  end if;

  insert into public.shopping_list_events (household_id, entry_id, consumable_id, kind, delta, before_quantity, after_quantity, unit, source, actor_member_id, idempotency_key)
  values (p_household_id, v_entry.id, p_consumable_id, case when v_after = 0 and p_kind <> 'set' then 'remove' else p_kind end,
    v_after - v_before, v_before, v_after, v_entry.unit, p_source, v_member, p_idempotency_key);

  return jsonb_build_object('entryId', v_entry.id, 'before', v_before, 'after', v_after, 'unit', v_entry.unit, 'version', v_entry.version, 'replayed', false);
end;
$$;

-- Bought: one purchase row, the bought amount added to stock, and the list
-- entry reduced by it — closed when all of it was bought, left open with the
-- rest when only part was. One transaction, once per idempotency key.
create or replace function public.mark_bought(
  p_household_id uuid,
  p_entry_id uuid,
  p_quantity numeric,
  p_purchased_on date,
  p_idempotency_key text,
  p_merchant text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid := wh.member_id(p_household_id);
  v_entry public.shopping_list_entries%rowtype;
  v_existing public.shopping_list_events%rowtype;
  v_purchase uuid;
  v_remaining numeric;
  v_stock jsonb;
begin
  if not wh.has_role(p_household_id, array['head', 'administrator', 'adult']) then
    raise exception 'only adults record what was bought' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'a purchase has an amount' using errcode = '22023';
  end if;

  select * into v_existing from public.shopping_list_events
  where household_id = p_household_id and idempotency_key = p_idempotency_key;
  if found then
    select * into v_entry from public.shopping_list_entries where id = v_existing.entry_id;
    return jsonb_build_object('entryId', v_entry.id, 'remaining', v_existing.after_quantity, 'unit', v_existing.unit,
      'purchaseId', v_entry.bought_purchase_id, 'replayed', true);
  end if;

  select * into v_entry from public.shopping_list_entries
  where id = p_entry_id and household_id = p_household_id and state = 'to_buy'
  for update;
  if not found then
    raise exception 'that is no longer on the list' using errcode = 'P0002';
  end if;

  insert into public.consumable_purchases (household_id, consumable_id, purchased_on, quantity, unit, merchant, shopping_entry_id)
  values (p_household_id, v_entry.consumable_id, coalesce(p_purchased_on, current_date), p_quantity, v_entry.unit,
    nullif(left(trim(coalesce(p_merchant, '')), 120), ''), v_entry.id)
  returning id into v_purchase;

  v_stock := public.apply_inventory_change(p_household_id, v_entry.consumable_id, 'add', p_quantity, v_entry.unit, 'purchase',
    p_idempotency_key || ':stock', null, jsonb_build_object('purchaseId', v_purchase, 'entryId', v_entry.id));

  v_remaining := greatest(v_entry.quantity - p_quantity, 0);
  if v_remaining = 0 then
    update public.shopping_list_entries
    set state = 'bought', bought_purchase_id = v_purchase, closed_at = now(), version = version + 1, updated_at = now()
    where id = v_entry.id;
  else
    update public.shopping_list_entries
    set quantity = v_remaining, version = version + 1, updated_at = now()
    where id = v_entry.id;
  end if;

  insert into public.shopping_list_events (household_id, entry_id, consumable_id, kind, delta, before_quantity, after_quantity, unit, source, actor_member_id, idempotency_key)
  values (p_household_id, v_entry.id, v_entry.consumable_id, 'bought', v_remaining - v_entry.quantity, v_entry.quantity, v_remaining, v_entry.unit, 'manual', v_member, p_idempotency_key);

  return jsonb_build_object('entryId', v_entry.id, 'remaining', v_remaining, 'unit', v_entry.unit, 'purchaseId', v_purchase,
    'stockAfter', v_stock -> 'after', 'replayed', false);
end;
$$;

-- A use-by date someone read off the pack, on what is at home. False when
-- nothing is recorded at home yet: a date without an amount says nothing.
create or replace function public.set_inventory_use_by(
  p_household_id uuid,
  p_consumable_id uuid,
  p_use_by date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not wh.has_role(p_household_id, array['head', 'administrator', 'adult']) then
    raise exception 'only adults change what is at home' using errcode = '42501';
  end if;
  update public.inventory_balances
  set use_by = p_use_by,
      use_by_basis = case when p_use_by is null then null else 'entered' end,
      version = version + 1,
      updated_at = now()
  where household_id = p_household_id and consumable_id = p_consumable_id;
  return found;
end;
$$;

revoke all on function public.set_inventory_use_by(uuid, uuid, date) from public, anon;
grant execute on function public.set_inventory_use_by(uuid, uuid, date) to authenticated;

revoke all on function public.apply_inventory_change(uuid, uuid, text, numeric, text, text, text, integer, jsonb) from public, anon;
revoke all on function public.adjust_shopping_entry(uuid, uuid, text, numeric, text, text, text, integer, uuid) from public, anon;
revoke all on function public.mark_bought(uuid, uuid, numeric, date, text, text) from public, anon;
grant execute on function public.apply_inventory_change(uuid, uuid, text, numeric, text, text, text, integer, jsonb) to authenticated;
grant execute on function public.adjust_shopping_entry(uuid, uuid, text, numeric, text, text, text, integer, uuid) to authenticated;
grant execute on function public.mark_bought(uuid, uuid, numeric, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Item photos: the private avatars bucket, under <household>/groceries/.
-- Adults and Admins add and change them; every member reads them through
-- the bucket's existing household-member select policy.
-- ---------------------------------------------------------------------------

create policy "avatars_grocery_insert_adult"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = 'groceries'
    and wh.has_role(((storage.foldername(name))[1])::uuid, array['head', 'administrator', 'adult'])
  );

create policy "avatars_grocery_update_adult"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = 'groceries'
    and wh.has_role(((storage.foldername(name))[1])::uuid, array['head', 'administrator', 'adult'])
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = 'groceries'
    and wh.has_role(((storage.foldername(name))[1])::uuid, array['head', 'administrator', 'adult'])
  );

create policy "avatars_grocery_delete_adult"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = 'groceries'
    and wh.has_role(((storage.foldername(name))[1])::uuid, array['head', 'administrator', 'adult'])
  );

-- ---------------------------------------------------------------------------
-- Groceries on every plan (D3)
-- ---------------------------------------------------------------------------

insert into public.plan_features (plan_key, feature_key, enabled, limit_per_period, period)
select key, 'groceries.core', true, null, 'forever' from public.plans
on conflict do nothing;

notify pgrst, 'reload schema';
