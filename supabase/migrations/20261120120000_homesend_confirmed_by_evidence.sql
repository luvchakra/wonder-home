-- Confirmation by action and evidence (the owner's 2026-11-20 HomeSend review, part 2).
--
-- A Checking entry is now also confirmed by:
--   payment_proof  a bank, card or UPI message showing the household paid it (homesend/payment-apply.ts)
--   receipt        a matching receipt from its payee (homebrain/verify-night.ts)
--   marked_paid    someone marking it paid (homesend/changes.ts confirmByAction)
--   due_passed     its day passing with no correction and no conflict; never a health record
--
-- Safe in either order: the code writes these values and, while this check still
-- refuses them (23514), confirms the entry with its basis left blank (or "person"
-- for marking paid). Widening a check never invalidates a stored row.

alter table public.homesend_changes drop constraint if exists homesend_changes_confirmed_basis_check;
alter table public.homesend_changes add constraint homesend_changes_confirmed_basis_check
  check (confirmed_basis is null or confirmed_basis in ('person', 'answer', 'bar', 'second_source', 'recurring', 'payment_proof', 'receipt', 'marked_paid', 'due_passed'));

comment on column public.homesend_changes.confirmed_basis is
  'Why it is confirmed: a person, an answer, the bar, overnight evidence (second_source, recurring, receipt, due_passed), a payment proof, or someone marking it paid.';
