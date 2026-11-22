-- Why a notification was cleared (owner, 2026-11-22: "keep clearing
-- notifications as decisions are taken and notifications are stale or not
-- applicable anymore"). Written by WonderHome's one resolver
-- (packages/core/src/notifications/resolve.ts, stale.ts) beside
-- status = 'resolved'; kept in history, never deleted. Null for anything
-- resolved before this column, or resolved by a person.
--
-- Safe in either order: the writer retries without the column when it is
-- not there yet, and no reader depends on it.
alter table public.notifications
  add column if not exists resolved_reason text
    check (resolved_reason is null or resolved_reason in ('decided', 'superseded', 'source_gone', 'settled', 'past', 'expired', 'duplicate'));

comment on column public.notifications.resolved_reason is
  'Why WonderHome resolved it: decided, superseded, source_gone, settled, past, expired or duplicate (notifications/resolve.ts).';
