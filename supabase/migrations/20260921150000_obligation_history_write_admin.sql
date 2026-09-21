-- `recordAmount` (packages/core/src/finance/repository.ts) has always needed
-- to write to two tables: an upsert into `obligation_history`, and — when the
-- amount is unusual — an upsert into `spend_anomalies`. Both tables shipped
-- with a select policy only; every other financial table in this migration
-- got a matching `_write_admin` policy alongside its select policy, and these
-- two did not. The gap was invisible until now because nothing called
-- `recordAmount` through an authenticated session — the email connector isn't
-- live yet, and there was no "Add transaction" UI path. Wiring one up in this
-- same change surfaced it immediately: a household admin got "You cannot
-- record amounts for this household" on the very first real attempt.

create policy obligation_history_write_admin on public.obligation_history for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create policy spend_anomalies_insert_admin on public.spend_anomalies for insert
  to authenticated
  with check (wh.is_household_admin(household_id));
