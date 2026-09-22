-- HomeSend Phase 2: the email intake channel.
--
-- Two additions:
--
-- 1. `homesend_addresses` -- one routing address per household
--    (`hs-<token>@<platform domain>`), the "resolve household from an inbound
--    payload" boundary the architecture doc requires: the address is looked
--    up server-side by a provider-authenticated webhook, never trusted from
--    the inbound payload itself. Admin-managed, same shape as an AI/voice key
--    (create/rotate/revoke, audited). The plaintext address is stored (not
--    hashed) because, unlike an invitation token, it must be redisplayed to
--    the household repeatedly (copy/share/add-to-contacts) rather than only
--    verified once -- its protection is its own unguessable randomness, the
--    same property that keeps unsolicited mail off it, not secrecy against a
--    database read.
--
-- 2. `home_send_items` widened for a real channel with no acting household
--    member: `source` gains `'email'`, `external_id` carries the provider's
--    own message id (idempotency -- the same email forwarded twice must not
--    create two intake rows), and `sender_address` carries who it came from
--    (real, used in the audit trail). `created_by_member_id` becomes
--    nullable -- nobody in the household typed this in -- and a new
--    constraint keeps the two facts locked together: an email-sourced item
--    always has no member; every other source always does.

alter table public.home_send_items drop constraint home_send_items_source_check;
alter table public.home_send_items add constraint home_send_items_source_check
  check (source in ('manual_upload', 'pasted_text', 'email'));

-- An email arrives as text, the same shape pasted_text already requires.
alter table public.home_send_items drop constraint home_send_items_has_content;
alter table public.home_send_items add constraint home_send_items_has_content check (
  (source = 'manual_upload' and file_path is not null)
  or (source in ('pasted_text', 'email') and raw_text is not null)
);

alter table public.home_send_items
  alter column created_by_member_id drop not null;

alter table public.home_send_items
  add column external_id text check (length(trim(external_id)) between 1 and 200),
  add column sender_address text check (length(trim(sender_address)) between 1 and 320);

alter table public.home_send_items
  add constraint home_send_items_actor_matches_source check (
    (source = 'email' and created_by_member_id is null)
    or (source != 'email' and created_by_member_id is not null)
  );

create unique index home_send_items_external_id_idx
  on public.home_send_items (household_id, external_id)
  where external_id is not null;

create table public.homesend_addresses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  address text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  revoked_at timestamptz,
  constraint homesend_addresses_one_per_household unique (household_id),
  constraint homesend_addresses_address_unique unique (address),
  constraint homesend_addresses_revoked_consistency check ((status = 'revoked') = (revoked_at is not null))
);

comment on table public.homesend_addresses is
  'Each household''s own HomeSend email address. An inbound webhook resolves the household by looking this up -- it never accepts a household id from the payload itself.';

alter table public.homesend_addresses enable row level security;

-- Every member needs to be able to read/copy/share the address; only an
-- admin creates, rotates or revokes it -- the same admin-only shape as
-- setting the household's own AI key.
create policy "homesend_addresses_select_member"
  on public.homesend_addresses for select
  to authenticated
  using (wh.is_member(household_id));

create policy "homesend_addresses_insert_admin"
  on public.homesend_addresses for insert
  to authenticated
  with check (wh.is_household_admin(household_id));

create policy "homesend_addresses_update_admin"
  on public.homesend_addresses for update
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

notify pgrst, 'reload schema';
