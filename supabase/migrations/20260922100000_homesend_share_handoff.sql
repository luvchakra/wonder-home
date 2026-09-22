-- HomeSend Phase 4: the PWA Web Share Target's signed-out handoff.
--
-- `manifest.webmanifest`'s new `share_target` makes WonderHome a target in
-- the OS share sheet once installed -- but a share can land before anyone
-- has ever signed in on that device (a fresh install, an expired session).
-- The share endpoint (`POST /api/v1/intake/share`) has no household to
-- write into at that point, so it cannot call `createHomeSendItem` the way
-- a signed-in share does. This table is the bridge: the shared content,
-- staged for a short window with no household attached, keyed by an
-- unguessable token carried through `/sign-in?next=...` and consumed once
-- sign-in actually resolves a household -- the same "the token itself is
-- the only credential" shape `homesend_addresses`' own token already uses,
-- taken all the way (no RLS grant reaches this table at all; only the
-- server's own admin client, which bypasses RLS, ever reads or writes it).
create table public.homesend_share_handoffs (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  kind text not null check (kind in ('text', 'file')),
  raw_text text check (length(trim(raw_text)) between 1 and 4000),
  file_bytes bytea,
  file_content_type text check (file_content_type in ('image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz not null default now(),
  -- A share sheet is used within seconds of a sign-in prompt appearing, not
  -- browsed back to an hour later -- short-lived on purpose.
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  constraint homesend_share_handoffs_token_unique unique (token),
  constraint homesend_share_handoffs_kind_has_content check (
    (kind = 'text' and raw_text is not null and file_bytes is null and file_content_type is null)
    or (kind = 'file' and file_bytes is not null and file_content_type is not null and raw_text is null)
  )
);

comment on table public.homesend_share_handoffs is
  'A share sheet''s content, staged briefly while a signed-out person completes sign-in. No household_id: none is known yet. Never RLS-reachable from any session -- the unguessable token is the only credential, resolved and deleted server-side once sign-in completes.';

alter table public.homesend_share_handoffs enable row level security;

-- No client, signed in or not, has a legitimate reason to read this table
-- directly. This policy exists only so the table is not "no policy at all"
-- (scripts/test-tenant-isolation-rls.mjs treats that as unprotected) --
-- the same shape `audit_events` already uses for a table that is real,
-- RLS-enabled, and still correctly unreachable from every session.
create policy homesend_share_handoffs_no_client_access
  on public.homesend_share_handoffs for select
  to authenticated
  using (false);

create index homesend_share_handoffs_expires_at_idx on public.homesend_share_handoffs (expires_at);

notify pgrst, 'reload schema';
