-- Commerce, groceries and pet supplies (stories 09-001 through 09-008).
--
-- Applied to the wonder-home Supabase project as version 20260917143614.
--
-- The organising idea is that WonderHome does not keep a pantry inventory.
-- Counting what is in the house requires somebody to keep the count accurate,
-- and that is precisely the work this product exists not to create. What it
-- keeps instead is a consumption rate and the evidence behind it, from which a
-- depletion date follows.
--
-- The evidence requirement is a constraint rather than a convention: a
-- consumable cannot claim a rate without saying where the rate came from. A
-- shopping suggestion that cannot answer "why do you think we need this?" is
-- how a household learns to stop trusting the list.
--
-- Money is minor units throughout. Storing currency as a float is a bug waiting
-- for a rounding error to find it, and this table eventually spends real money.

create table public.consumables (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null default 'grocery'
    check (category in ('grocery', 'household', 'pet', 'personal', 'medical')),
  -- Pet supplies use the same model, scoped to the animal they belong to.
  pet_id uuid references public.pets(id) on delete cascade,
  unit text not null default 'unit' check (length(trim(unit)) between 1 and 20),
  typical_quantity numeric(10, 2) not null default 1 check (typical_quantity > 0),
  -- How long one typical quantity lasts. Null means WonderHome does not know
  -- yet, which is an honest state and produces no suggestions.
  days_per_unit numeric(6, 2) check (days_per_unit > 0),
  -- Where the rate came from. Required whenever there is a rate, because a
  -- prediction that cannot cite its basis must not become a shopping action.
  evidence_basis text check (evidence_basis in ('purchase_history', 'configured_inventory', 'member_stated')),
  last_purchased_on date,
  last_purchased_quantity numeric(10, 2) check (last_purchased_quantity > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consumables_rate_has_evidence check (
    (days_per_unit is null) = (evidence_basis is null)
  ),
  constraint consumables_pet_is_pet_category check (
    pet_id is null or category = 'pet'
  ),
  unique (household_id, name)
);

comment on table public.consumables is
  'Something the household runs out of. A consumption rate and its evidence, never an inventory somebody has to keep accurate.';

alter table public.consumables enable row level security;

create index consumables_household_idx on public.consumables (household_id) where active;

create trigger consumables_set_updated_at
  before update on public.consumables
  for each row execute function wh.set_updated_at();

create table public.consumable_purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  consumable_id uuid not null references public.consumables(id) on delete cascade,
  purchased_on date not null,
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_cost_minor bigint check (unit_cost_minor >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  merchant text check (length(trim(merchant)) <= 120),
  created_at timestamptz not null default now(),
  constraint consumable_purchases_cost_has_currency check ((unit_cost_minor is null) = (currency is null))
);

comment on table public.consumable_purchases is
  'What was actually bought and when. The evidence a purchase-history prediction is allowed to rest on.';

alter table public.consumable_purchases enable row level security;

create index consumable_purchases_consumable_idx
  on public.consumable_purchases (consumable_id, purchased_on desc);

create table public.purchase_policies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- Narrowest matching scope wins, so a household can allow small grocery
  -- top-ups while still approving everything from one particular merchant.
  scope text not null check (scope in ('any', 'category', 'merchant', 'consumable')),
  scope_value text check (length(trim(scope_value)) <= 120),
  -- Above this, a person decides. Null means no amount is automatic.
  auto_approve_under_minor bigint check (auto_approve_under_minor >= 0),
  -- A hard ceiling: nothing above this proceeds even with approval, which is
  -- what stops an approval prompt from becoming a rubber stamp for any figure.
  hard_limit_minor bigint check (hard_limit_minor >= 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_policies_scope_has_value check (
    scope = 'any' or scope_value is not null
  ),
  constraint purchase_policies_limits_ordered check (
    auto_approve_under_minor is null
    or hard_limit_minor is null
    or auto_approve_under_minor <= hard_limit_minor
  ),
  unique (household_id, scope, scope_value)
);

comment on table public.purchase_policies is
  'What the household lets WonderHome buy without asking. Evaluated server-side; the UI never decides this.';

alter table public.purchase_policies enable row level security;

create trigger purchase_policies_set_updated_at
  before update on public.purchase_policies
  for each row execute function wh.set_updated_at();

create table public.cart_suggestions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  consumable_id uuid not null references public.consumables(id) on delete cascade,
  quantity numeric(10, 2) not null check (quantity > 0),
  -- Why this is on the list, in the household's words. Not optional: a
  -- suggestion nobody can interrogate is a suggestion nobody will trust.
  reason text not null check (length(trim(reason)) between 1 and 200),
  evidence_basis text not null
    check (evidence_basis in ('purchase_history', 'configured_inventory', 'member_stated')),
  needed_by date,
  estimated_cost_minor bigint check (estimated_cost_minor >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'suggested'
    check (status in ('suggested', 'accepted', 'deferred', 'removed', 'ordered')),
  deferred_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_suggestions_cost_has_currency check (
    (estimated_cost_minor is null) = (currency is null)
  ),
  constraint cart_suggestions_deferred_has_date check (
    status <> 'deferred' or deferred_until is not null
  ),
  unique (household_id, consumable_id, status)
);

comment on table public.cart_suggestions is
  'What WonderHome thinks the household needs, with why and when. Every row can explain itself.';

alter table public.cart_suggestions enable row level security;

create index cart_suggestions_open_idx on public.cart_suggestions (household_id, needed_by)
  where status = 'suggested';

create trigger cart_suggestions_set_updated_at
  before update on public.cart_suggestions
  for each row execute function wh.set_updated_at();

create table public.merchant_offers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  consumable_id uuid not null references public.consumables(id) on delete cascade,
  provider text not null check (length(trim(provider)) between 1 and 60),
  price_minor bigint not null check (price_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  available boolean not null default true,
  delivery_days integer check (delivery_days >= 0),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.merchant_offers is
  'What each merchant was offering when we last looked. A snapshot with a timestamp, never a price presented as current.';

alter table public.merchant_offers enable row level security;

create index merchant_offers_recent_idx
  on public.merchant_offers (consumable_id, observed_at desc);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  integration_id uuid references public.integrations(id) on delete set null,
  provider text not null check (length(trim(provider)) between 1 and 60),
  external_id text check (length(trim(external_id)) <= 200),
  status text not null default 'draft' check (status in
    ('draft', 'pending_approval', 'placed', 'confirmed', 'shipped', 'delivered', 'cancelled', 'failed')),
  total_minor bigint not null default 0 check (total_minor >= 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  -- Retrying a placement must not buy the groceries twice. The key is the
  -- household's, not the provider's, so a provider timeout is safe to retry.
  idempotency_key text check (length(trim(idempotency_key)) between 1 and 200),
  approved_by_member_id uuid references public.household_members(id) on delete set null,
  approved_at timestamptz,
  placed_at timestamptz,
  expected_at timestamptz,
  delivered_at timestamptz,
  failure_code text check (length(trim(failure_code)) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, idempotency_key),
  unique (integration_id, external_id),
  -- An order that spends money after a person approved it has to record which
  -- person. An approval nobody signed is not an approval.
  constraint orders_approval_has_approver check (
    (approved_at is null) = (approved_by_member_id is null)
  ),
  constraint orders_placed_has_time check (
    status not in ('placed', 'confirmed', 'shipped', 'delivered') or placed_at is not null
  ),
  constraint orders_failure_has_code check (status <> 'failed' or failure_code is not null)
);

comment on table public.orders is
  'A purchase, from draft to delivered. Idempotent on the household''s own key so a retry cannot buy twice.';

alter table public.orders enable row level security;

create index orders_open_idx on public.orders (household_id, updated_at desc)
  where status not in ('delivered', 'cancelled', 'failed');

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function wh.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  consumable_id uuid references public.consumables(id) on delete set null,
  description text not null check (length(trim(description)) between 1 and 200),
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  created_at timestamptz not null default now()
);

comment on table public.order_items is
  'What is in an order. Keeps its own description so an order stays readable after a consumable is renamed or removed.';

alter table public.order_items enable row level security;

create index order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- Cross-table invariants
-- ---------------------------------------------------------------------------

create or replace function wh.assert_commerce_row_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_id uuid;
  v_table text;
begin
  v_id := (to_jsonb(new) ->> tg_argv[0])::uuid;
  v_table := tg_argv[1];

  if v_id is null then
    return new;
  end if;

  execute format('select household_id from public.%I where id = $1', v_table)
    into v_household using v_id;

  if v_household is distinct from new.household_id then
    raise exception '% % is not part of household %', v_table, v_id, new.household_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger consumable_purchases_consumable_valid
  before insert or update on public.consumable_purchases
  for each row execute function wh.assert_commerce_row_in_household('consumable_id', 'consumables');

create trigger cart_suggestions_consumable_valid
  before insert or update on public.cart_suggestions
  for each row execute function wh.assert_commerce_row_in_household('consumable_id', 'consumables');

create trigger merchant_offers_consumable_valid
  before insert or update on public.merchant_offers
  for each row execute function wh.assert_commerce_row_in_household('consumable_id', 'consumables');

create trigger order_items_order_valid
  before insert or update on public.order_items
  for each row execute function wh.assert_commerce_row_in_household('order_id', 'orders');

create trigger consumables_pet_valid
  before insert or update on public.consumables
  for each row execute function wh.assert_commerce_row_in_household('pet_id', 'pets');

-- ---------------------------------------------------------------------------
-- Row level security
--
-- The shopping list is household reading and household writing: anyone who
-- lives here can say the milk is running out. Spending is narrower — placing
-- and approving an order is for the people who hold finance.pay, and that is
-- checked here as well as in the API so a direct call cannot spend money the
-- UI would not have offered to spend.
--
-- `wh.is_household_admin` is used rather than a second permission table in SQL:
-- in packages/core/src/identity/permissions.ts, finance.pay is held by exactly
-- head and administrator, which is what that helper already means. Re-encoding
-- the whole role-to-permission map here would create a second source of truth
-- that drifts silently. A test asserts the two agree.
-- ---------------------------------------------------------------------------

create policy consumables_select_member on public.consumables for select
  to authenticated using (wh.is_member(household_id));

create policy consumables_write_member on public.consumables for all
  to authenticated
  using (wh.is_member(household_id))
  with check (wh.is_member(household_id));

create policy consumable_purchases_select_member on public.consumable_purchases for select
  to authenticated using (wh.is_member(household_id));

create policy consumable_purchases_write_member on public.consumable_purchases for all
  to authenticated
  using (wh.is_member(household_id))
  with check (wh.is_member(household_id));

create policy cart_suggestions_select_member on public.cart_suggestions for select
  to authenticated using (wh.is_member(household_id));

create policy cart_suggestions_write_member on public.cart_suggestions for all
  to authenticated
  using (wh.is_member(household_id))
  with check (wh.is_member(household_id));

create policy merchant_offers_select_member on public.merchant_offers for select
  to authenticated using (wh.is_member(household_id));

-- Offers are observations from a provider, so the server writes them. A member
-- who could insert one could make anything look like the cheapest option.

create policy purchase_policies_select_member on public.purchase_policies for select
  to authenticated using (wh.is_member(household_id));

create policy purchase_policies_write_admin on public.purchase_policies for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create policy orders_select_member on public.orders for select
  to authenticated using (wh.is_member(household_id));

create policy orders_write_finance on public.orders for all
  to authenticated
  using (wh.is_member(household_id) and wh.is_household_admin(household_id))
  with check (wh.is_member(household_id) and wh.is_household_admin(household_id));

create policy order_items_select_member on public.order_items for select
  to authenticated using (wh.is_member(household_id));

create policy order_items_write_finance on public.order_items for all
  to authenticated
  using (wh.is_member(household_id) and wh.is_household_admin(household_id))
  with check (wh.is_member(household_id) and wh.is_household_admin(household_id));

notify pgrst, 'reload schema';
