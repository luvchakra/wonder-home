-- HomeFood 25-012: changing how an item is counted, even when the new unit
-- does not convert (pasta kept in pieces, now in grams).
--
-- Stock and the list are kept in the item's base unit (g, ml, pcs, or its own
-- word), and nothing converts pieces to grams: a piece of pasta has no
-- weight WonderHome could know. So a change to a unit that does not convert
-- is one transaction that says what it did:
--   * what was at home is no longer a count anyone made, so it goes back to
--     "not counted yet" — the amount it had is kept on the change's record,
--     never silently dropped;
--   * an open list entry is closed and a new one opened in the new unit, at
--     the amount the server chose (the item's usual buy), each recorded as
--     list events;
--   * the item's unit, and its own step (in the new unit, or none), change.
-- A unit that converts (g to kg) changes the item only: its amounts are
-- already in grams. The server decides the base unit, the step and the new
-- list amount (`commerce/unit-change.ts`); this function checks who is
-- asking and keeps the writes together.

create table public.consumable_unit_changes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  consumable_id uuid not null references public.consumables(id) on delete cascade,
  from_unit text not null check (length(from_unit) between 1 and 20),
  to_unit text not null check (length(to_unit) between 1 and 20),
  converts boolean not null,
  stock_before numeric(12,3) check (stock_before is null or stock_before >= 0),
  stock_unit text check (stock_unit is null or length(stock_unit) between 1 and 20),
  stock_cleared boolean not null default false,
  list_before numeric(12,3) check (list_before is null or list_before >= 0),
  list_after numeric(12,3) check (list_after is null or list_after >= 0),
  actor_member_id uuid references public.household_members(id) on delete set null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 120),
  created_at timestamptz not null default now(),
  unique (household_id, idempotency_key)
);

comment on table public.consumable_unit_changes is
  'HomeFood 25-012: each time an item started being counted in another unit, append-only. When the unit did not convert, stock_before is what was at home before it went back to not counted, and the list restarted at list_after.';

create index consumable_unit_changes_item on public.consumable_unit_changes (consumable_id, created_at desc);

alter table public.consumable_unit_changes enable row level security;

create policy consumable_unit_changes_member_read on public.consumable_unit_changes
  for select to authenticated using (wh.is_member(household_id));

revoke insert, update, delete on public.consumable_unit_changes from anon, authenticated;
grant select on public.consumable_unit_changes to authenticated;

create or replace function public.change_consumable_unit(
  p_household_id uuid,
  p_consumable_id uuid,
  p_unit text,
  p_base_unit text,
  p_step numeric,
  p_list_quantity numeric,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid := wh.member_id(p_household_id);
  v_item public.consumables%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_entry public.shopping_list_entries%rowtype;
  v_done public.consumable_unit_changes%rowtype;
  v_new_entry uuid;
  v_stock_before numeric := null;
  v_stock_unit text := null;
  v_stock_cleared boolean := false;
  v_list_before numeric := null;
  v_list_after numeric := null;
  v_converts boolean := true;
begin
  if not wh.has_role(p_household_id, array['head', 'administrator', 'adult']) then
    raise exception 'only adults change how an item is counted' using errcode = '42501';
  end if;
  if p_unit is null or length(btrim(p_unit)) not between 1 and 20 or p_base_unit is null or length(btrim(p_base_unit)) not between 1 and 20 then
    raise exception 'not a unit' using errcode = '22023';
  end if;
  if p_step is not null and p_step <= 0 or p_list_quantity is not null and p_list_quantity < 0 then
    raise exception 'not an amount' using errcode = '22023';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100 then
    raise exception 'a change needs its own key' using errcode = '22023';
  end if;

  select * into v_item from public.consumables
  where id = p_consumable_id and household_id = p_household_id and active
  for update;
  if not found then
    raise exception 'item is not in this household' using errcode = '23514';
  end if;

  -- The same request again: it already happened.
  select * into v_done from public.consumable_unit_changes
  where household_id = p_household_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('unit', v_done.to_unit, 'stockCleared', case when v_done.stock_cleared then v_done.stock_before end,
      'listAfter', v_done.list_after, 'replayed', true);
  end if;
  if v_item.unit = p_unit and v_item.step is not distinct from p_step then
    select * into v_entry from public.shopping_list_entries where consumable_id = p_consumable_id and state = 'to_buy';
    return jsonb_build_object('unit', v_item.unit, 'stockCleared', null, 'listAfter', case when found then v_entry.quantity else null end, 'replayed', true);
  end if;

  select * into v_balance from public.inventory_balances where consumable_id = p_consumable_id for update;
  if found then
    v_stock_before := v_balance.quantity;
    v_stock_unit := v_balance.unit;
    if v_balance.unit <> p_base_unit then
      v_converts := false;
      v_stock_cleared := true;
      delete from public.inventory_balances where id = v_balance.id;
    end if;
  end if;

  select * into v_entry from public.shopping_list_entries
  where consumable_id = p_consumable_id and household_id = p_household_id and state = 'to_buy'
  for update;
  if found then
    v_list_before := v_entry.quantity;
    if v_entry.unit <> p_base_unit then
      v_converts := false;
      update public.shopping_list_entries
      set state = 'removed', closed_at = now(), version = version + 1, updated_at = now()
      where id = v_entry.id;
      insert into public.shopping_list_events (household_id, entry_id, consumable_id, kind, delta, before_quantity, after_quantity, unit, source, actor_member_id, idempotency_key)
      values (p_household_id, v_entry.id, p_consumable_id, 'remove', -v_entry.quantity, v_entry.quantity, 0, v_entry.unit, 'manual', v_member, p_idempotency_key || ':close');
      if coalesce(p_list_quantity, 0) > 0 then
        insert into public.shopping_list_entries (household_id, consumable_id, quantity, unit, source, meal_id, created_by_member_id)
        values (p_household_id, p_consumable_id, p_list_quantity, p_base_unit, 'manual', v_entry.meal_id, v_member)
        returning id into v_new_entry;
        insert into public.shopping_list_events (household_id, entry_id, consumable_id, kind, delta, before_quantity, after_quantity, unit, source, actor_member_id, idempotency_key)
        values (p_household_id, v_new_entry, p_consumable_id, 'set', p_list_quantity, 0, p_list_quantity, p_base_unit, 'manual', v_member, p_idempotency_key || ':open');
        v_list_after := p_list_quantity;
      else
        v_list_after := 0;
      end if;
    else
      v_list_after := v_entry.quantity;
    end if;
  end if;

  update public.consumables
  set unit = p_unit, step = p_step
  where id = p_consumable_id;

  insert into public.consumable_unit_changes (household_id, consumable_id, from_unit, to_unit, converts, stock_before, stock_unit, stock_cleared,
    list_before, list_after, actor_member_id, idempotency_key)
  values (p_household_id, p_consumable_id, v_item.unit, p_unit, v_converts, v_stock_before, v_stock_unit, v_stock_cleared,
    v_list_before, v_list_after, v_member, p_idempotency_key);

  return jsonb_build_object('unit', p_unit, 'stockCleared', case when v_stock_cleared then v_stock_before end, 'listAfter', v_list_after, 'replayed', false);
end;
$$;

revoke all on function public.change_consumable_unit(uuid, uuid, text, text, numeric, numeric, text) from public, anon;
grant execute on function public.change_consumable_unit(uuid, uuid, text, text, numeric, numeric, text) to authenticated;

comment on function public.change_consumable_unit(uuid, uuid, text, text, numeric, numeric, text) is
  'HomeFood 25-012: an item counted in a new unit. Stock that does not convert goes back to not counted (kept on consumable_unit_changes), an open list entry reopens in the new unit at the amount given, and the unit and step change. Adults only.';
