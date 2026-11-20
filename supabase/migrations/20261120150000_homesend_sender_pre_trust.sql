-- Known senders are trusted without asking (the owner, 2026-11-20, "HomeSend
-- on its own", decision 4; `packages/core/src/homesend/sender-pretrust.ts`).
--
-- On "Ask once", mail from an address the household's own records know (a
-- member's or teacher's email, a child's school's domain, a payee on record)
-- is added to its approved senders without "Trust this sender?":
--
--   homesend_email_allowlist.basis    why it is there when no person typed it
--                                     ('contact', 'school', 'payee'); null for
--                                     an entry an Admin added or trusted.
--   homesend_email_senders.pre_trust_off
--                                     an Admin removed this address from the
--                                     list: never pre-trusted again; its next
--                                     mail asks as for anyone new.
--
-- Safe in either order: before this runs, the code reads the list without
-- `basis` (every entry shows as added by a person), pre-trusts a known sender
-- for that delivery only without writing a row, and cannot record a removal
-- (nothing was written to remove). This only adds two nullable/defaulted
-- columns.

alter table public.homesend_email_allowlist
  add column if not exists basis text check (basis is null or basis in ('contact', 'school', 'payee'));

comment on column public.homesend_email_allowlist.basis is
  'Why the sender was trusted without a person typing it: the household''s records knew it (contact, school, payee). Null when an Admin added or trusted it.';

alter table public.homesend_email_senders
  add column if not exists pre_trust_off boolean not null default false;

comment on column public.homesend_email_senders.pre_trust_off is
  'An Admin removed this address from the approved senders: the household''s records never trust it on their own again.';

notify pgrst, 'reload schema';

-- Knowing instead of asking (2026-11-20): HomeSend reads what a sender's earlier
-- items became (`homesend/sender-history.ts`, `sender-pretrust.ts`), filtered by
-- household and sender. Safe in either order: without it the same bounded read
-- is only slower.
create index if not exists home_send_items_sender_idx
  on public.home_send_items (household_id, sender_address, created_at desc)
  where sender_address is not null;
