-- HomeSend Phase 6 hardening: rate limiting on the anonymous share handoff.
--
-- `POST /api/v1/intake/share`'s signed-out branch is the one genuinely
-- anonymous write in the HomeSend pipeline -- unauthenticated, no
-- membership check, and it writes a real row every time. `ip_hash` lets the
-- route count how many handoffs one caller has staged recently
-- (`countRecentShareHandoffs` in `homesend/share-handoff.ts`) and refuse
-- once it's too many (`mayCreateShareHandoff` in `homesend/rate-limit.ts`).
-- Only the sha256 of the caller's IP is ever stored, never the address
-- itself -- the same "count, don't keep the fact itself" shape the rest of
-- this schema already prefers.

alter table public.homesend_share_handoffs
  add column ip_hash text;

comment on column public.homesend_share_handoffs.ip_hash is
  'sha256 of the caller''s IP address, never the address itself -- used only to count recent anonymous shares for rate limiting.';

create index homesend_share_handoffs_ip_hash_created_at_idx
  on public.homesend_share_handoffs (ip_hash, created_at)
  where ip_hash is not null;

notify pgrst, 'reload schema';
