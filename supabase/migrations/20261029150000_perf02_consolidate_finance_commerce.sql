-- PERF-02: consolidate overlapping permissive RLS policies (finance-commerce).
-- One permissive policy per {table, authenticated, command}; USING/WITH CHECK
-- are the exact OR of the originals, so the row set each role may read/write
-- is unchanged. Restrictive and non-authenticated policies are left intact.
-- Equivalence is proven by scripts/test-policy-consolidation-rls.mjs.

-- budgets: 2 permissive policy(ies) -> one per command.
drop policy if exists budgets_write_admin on public.budgets;
drop policy if exists budgets_select_finance on public.budgets;
create policy budgets_select on public.budgets
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.finance_households() AS finance_households)))
  );
create policy budgets_insert on public.budgets
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy budgets_update on public.budgets
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy budgets_delete on public.budgets
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists budgets_select on public.budgets;
--   drop policy if exists budgets_insert on public.budgets;
--   drop policy if exists budgets_update on public.budgets;
--   drop policy if exists budgets_delete on public.budgets;
--   create policy budgets_write_admin on public.budgets for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy budgets_select_finance on public.budgets for select to authenticated using ((household_id IN ( SELECT wh.finance_households() AS finance_households)));

-- policies: 2 permissive policy(ies) -> one per command.
drop policy if exists policies_write_admin on public.policies;
drop policy if exists policies_select_member on public.policies;
create policy policies_select on public.policies
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy policies_insert on public.policies
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy policies_update on public.policies
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy policies_delete on public.policies
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists policies_select on public.policies;
--   drop policy if exists policies_insert on public.policies;
--   drop policy if exists policies_update on public.policies;
--   drop policy if exists policies_delete on public.policies;
--   create policy policies_write_admin on public.policies for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy policies_select_member on public.policies for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- purchase_policies: 2 permissive policy(ies) -> one per command.
drop policy if exists purchase_policies_write_admin on public.purchase_policies;
drop policy if exists purchase_policies_select_member on public.purchase_policies;
create policy purchase_policies_select on public.purchase_policies
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy purchase_policies_insert on public.purchase_policies
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy purchase_policies_update on public.purchase_policies
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy purchase_policies_delete on public.purchase_policies
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists purchase_policies_select on public.purchase_policies;
--   drop policy if exists purchase_policies_insert on public.purchase_policies;
--   drop policy if exists purchase_policies_update on public.purchase_policies;
--   drop policy if exists purchase_policies_delete on public.purchase_policies;
--   create policy purchase_policies_write_admin on public.purchase_policies for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy purchase_policies_select_member on public.purchase_policies for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- payment_intents: 2 permissive policy(ies) -> one per command.
drop policy if exists payment_intents_write_admin on public.payment_intents;
drop policy if exists payment_intents_select_finance on public.payment_intents;
create policy payment_intents_select on public.payment_intents
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.finance_households() AS finance_households)))
  );
create policy payment_intents_insert on public.payment_intents
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy payment_intents_update on public.payment_intents
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy payment_intents_delete on public.payment_intents
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists payment_intents_select on public.payment_intents;
--   drop policy if exists payment_intents_insert on public.payment_intents;
--   drop policy if exists payment_intents_update on public.payment_intents;
--   drop policy if exists payment_intents_delete on public.payment_intents;
--   create policy payment_intents_write_admin on public.payment_intents for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy payment_intents_select_finance on public.payment_intents for select to authenticated using ((household_id IN ( SELECT wh.finance_households() AS finance_households)));

-- orders: 2 permissive policy(ies) -> one per command.
drop policy if exists orders_write_finance on public.orders;
drop policy if exists orders_select_member on public.orders;
create policy orders_select on public.orders
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (household_id IN ( SELECT wh.admin_households() AS admin_households))))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy orders_insert on public.orders
  for insert to authenticated
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (household_id IN ( SELECT wh.admin_households() AS admin_households))))
  );
create policy orders_update on public.orders
  for update to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (household_id IN ( SELECT wh.admin_households() AS admin_households))))
  )
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (household_id IN ( SELECT wh.admin_households() AS admin_households))))
  );
create policy orders_delete on public.orders
  for delete to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (household_id IN ( SELECT wh.admin_households() AS admin_households))))
  );
-- ROLLBACK:
--   drop policy if exists orders_select on public.orders;
--   drop policy if exists orders_insert on public.orders;
--   drop policy if exists orders_update on public.orders;
--   drop policy if exists orders_delete on public.orders;
--   create policy orders_write_finance on public.orders for all to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (household_id IN ( SELECT wh.admin_households() AS admin_households)))) with check (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (household_id IN ( SELECT wh.admin_households() AS admin_households))));
--   create policy orders_select_member on public.orders for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- order_items: 2 permissive policy(ies) -> one per command.
drop policy if exists order_items_write_finance on public.order_items;
drop policy if exists order_items_select_member on public.order_items;
create policy order_items_select on public.order_items
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (household_id IN ( SELECT wh.admin_households() AS admin_households))))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy order_items_insert on public.order_items
  for insert to authenticated
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (household_id IN ( SELECT wh.admin_households() AS admin_households))))
  );
create policy order_items_update on public.order_items
  for update to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (household_id IN ( SELECT wh.admin_households() AS admin_households))))
  )
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (household_id IN ( SELECT wh.admin_households() AS admin_households))))
  );
create policy order_items_delete on public.order_items
  for delete to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (household_id IN ( SELECT wh.admin_households() AS admin_households))))
  );
-- ROLLBACK:
--   drop policy if exists order_items_select on public.order_items;
--   drop policy if exists order_items_insert on public.order_items;
--   drop policy if exists order_items_update on public.order_items;
--   drop policy if exists order_items_delete on public.order_items;
--   create policy order_items_write_finance on public.order_items for all to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (household_id IN ( SELECT wh.admin_households() AS admin_households)))) with check (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (household_id IN ( SELECT wh.admin_households() AS admin_households))));
--   create policy order_items_select_member on public.order_items for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- obligations: 2 permissive policy(ies) -> one per command.
drop policy if exists obligations_write_admin on public.obligations;
drop policy if exists obligations_select_finance on public.obligations;
create policy obligations_select on public.obligations
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.finance_households() AS finance_households)))
  );
create policy obligations_insert on public.obligations
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy obligations_update on public.obligations
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy obligations_delete on public.obligations
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists obligations_select on public.obligations;
--   drop policy if exists obligations_insert on public.obligations;
--   drop policy if exists obligations_update on public.obligations;
--   drop policy if exists obligations_delete on public.obligations;
--   create policy obligations_write_admin on public.obligations for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy obligations_select_finance on public.obligations for select to authenticated using ((household_id IN ( SELECT wh.finance_households() AS finance_households)));

-- obligation_history: 2 permissive policy(ies) -> one per command.
drop policy if exists obligation_history_write_admin on public.obligation_history;
drop policy if exists obligation_history_select_finance on public.obligation_history;
create policy obligation_history_select on public.obligation_history
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.finance_households() AS finance_households)))
  );
create policy obligation_history_insert on public.obligation_history
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy obligation_history_update on public.obligation_history
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy obligation_history_delete on public.obligation_history
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists obligation_history_select on public.obligation_history;
--   drop policy if exists obligation_history_insert on public.obligation_history;
--   drop policy if exists obligation_history_update on public.obligation_history;
--   drop policy if exists obligation_history_delete on public.obligation_history;
--   create policy obligation_history_write_admin on public.obligation_history for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy obligation_history_select_finance on public.obligation_history for select to authenticated using ((household_id IN ( SELECT wh.finance_households() AS finance_households)));

-- obligation_periods: 2 permissive policy(ies) -> one per command.
drop policy if exists obligation_periods_write_admin on public.obligation_periods;
drop policy if exists obligation_periods_select_finance on public.obligation_periods;
create policy obligation_periods_select on public.obligation_periods
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (NOT (household_id IN ( SELECT r.household_id
   FROM household_roles r
  WHERE (((r.household_id, r.member_id) IN ( SELECT my_memberships.household_id,
            my_memberships.member_id
           FROM wh.my_memberships() my_memberships(household_id, member_id))) AND (r.role = ANY (ARRAY['child'::text, 'helper'::text]))))))))
    OR ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy obligation_periods_insert on public.obligation_periods
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy obligation_periods_update on public.obligation_periods
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy obligation_periods_delete on public.obligation_periods
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists obligation_periods_select on public.obligation_periods;
--   drop policy if exists obligation_periods_insert on public.obligation_periods;
--   drop policy if exists obligation_periods_update on public.obligation_periods;
--   drop policy if exists obligation_periods_delete on public.obligation_periods;
--   create policy obligation_periods_write_admin on public.obligation_periods for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy obligation_periods_select_finance on public.obligation_periods for select to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (NOT (household_id IN ( SELECT r.household_id    FROM household_roles r   WHERE (((r.household_id, r.member_id) IN ( SELECT my_memberships.household_id,             my_memberships.member_id            FROM wh.my_memberships() my_memberships(household_id, member_id))) AND (r.role = ANY (ARRAY['child'::text, 'helper'::text]))))))));

-- gift_plans: 2 permissive policy(ies) -> one per command.
drop policy if exists gift_plans_write_member on public.gift_plans;
drop policy if exists gift_plans_select_member on public.gift_plans;
create policy gift_plans_select on public.gift_plans
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy gift_plans_insert on public.gift_plans
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy gift_plans_update on public.gift_plans
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy gift_plans_delete on public.gift_plans
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
-- ROLLBACK:
--   drop policy if exists gift_plans_select on public.gift_plans;
--   drop policy if exists gift_plans_insert on public.gift_plans;
--   drop policy if exists gift_plans_update on public.gift_plans;
--   drop policy if exists gift_plans_delete on public.gift_plans;
--   create policy gift_plans_write_member on public.gift_plans for all to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households))) with check ((household_id IN ( SELECT wh.member_households() AS member_households)));
--   create policy gift_plans_select_member on public.gift_plans for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- service_requests: 2 permissive policy(ies) -> one per command.
drop policy if exists service_requests_write_member on public.service_requests;
drop policy if exists service_requests_select_member on public.service_requests;
create policy service_requests_select on public.service_requests
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy service_requests_insert on public.service_requests
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy service_requests_update on public.service_requests
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy service_requests_delete on public.service_requests
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
-- ROLLBACK:
--   drop policy if exists service_requests_select on public.service_requests;
--   drop policy if exists service_requests_insert on public.service_requests;
--   drop policy if exists service_requests_update on public.service_requests;
--   drop policy if exists service_requests_delete on public.service_requests;
--   create policy service_requests_write_member on public.service_requests for all to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households))) with check ((household_id IN ( SELECT wh.member_households() AS member_households)));
--   create policy service_requests_select_member on public.service_requests for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

