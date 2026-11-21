-- 11-019: part payment and how a bill was paid (the owner, 2026-11-21).
--
-- obligation_history keeps one row per bill and month. A part payment keeps
-- that row: amount_minor is what has been paid so far, due_minor the month's
-- whole bill while some of it is left (null once paid in full), and parts
-- each payment that made it up. paid_with is how it was paid, picked from a
-- known set. Additive only, so the code runs before or after it (a write that
-- finds these columns missing retries without them; part payment waits).
-- Row-level security is unchanged: the table's existing policies cover them.

alter table public.obligation_history
  add column if not exists paid_with text
    check (paid_with is null or paid_with in ('upi', 'card', 'cash', 'bank_transfer')),
  add column if not exists due_minor bigint
    check (due_minor is null or due_minor > 0),
  add column if not exists parts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(parts) = 'array');

comment on column public.obligation_history.paid_with is
  'How the household paid: upi, card, cash or bank_transfer. Null when nobody said.';
comment on column public.obligation_history.due_minor is
  'The month''s whole bill while only part of it is paid; amount_minor is what is paid so far. Null once paid in full.';
comment on column public.obligation_history.parts is
  'Each payment towards the month when it was paid in parts: [{amountMinor, paidOn, paidWith, memberId}].';
