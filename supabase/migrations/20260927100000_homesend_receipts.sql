-- Story 09-009: a receipt becomes purchase history.
--
-- A paid receipt was classified "unknown" (it asks nothing to be paid, so it
-- is not a bill) and then went nowhere: `consumable_purchases` has been
-- modelled since module 09 and never written. A receipt is now its own
-- HomeSend kind, and each line a person confirms becomes one purchase row,
-- recorded as its own `homesend_changes` row (domain 'purchase') so it can be
-- undone on its own, through the same commerce service that recorded it.

alter table public.home_send_items drop constraint home_send_items_classified_kind_check;
alter table public.home_send_items add constraint home_send_items_classified_kind_check
  check (classified_kind in ('bill', 'school_item', 'grocery_item', 'health_document', 'receipt', 'unknown'));

alter table public.homesend_changes drop constraint homesend_changes_domain_check;
alter table public.homesend_changes add constraint homesend_changes_domain_check
  check (domain in ('bill', 'school_item', 'grocery_item', 'health_document', 'purchase'));

notify pgrst, 'reload schema';
