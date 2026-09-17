-- Idempotency keys (story 18-004).
--
-- Applied to the wonder-home Supabase project as version 20260917012541.
--
-- A retry must not charge a card twice, send a second invitation or create a
-- duplicate household. The first request under a key runs and its response is
-- recorded here; a repeat replays that response without executing anything.
--
-- The uniqueness is (household_id, endpoint, key), not key alone: a key is
-- meaningful only within one household and one operation, so the same string
-- used elsewhere is a new request rather than a false cache hit.

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  key text not null,
  endpoint text not null,
  -- Fingerprint of the request body. A key reused with a different payload is a
  -- client bug; replaying the old response would hide it.
  request_hash text not null,
  response_status integer not null check (response_status between 100 and 599),
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (household_id, endpoint, key)
);

comment on table public.idempotency_keys is
  'Recorded responses for replayed requests. Scoped per household and endpoint so a key cannot collide across tenants or operations.';

alter table public.idempotency_keys enable row level security;

create index idempotency_keys_expiry_idx on public.idempotency_keys (expires_at);

create policy idempotency_keys_select_member
  on public.idempotency_keys for select
  to authenticated
  using (wh.is_member(household_id));

create policy idempotency_keys_insert_member
  on public.idempotency_keys for insert
  to authenticated
  with check (wh.is_member(household_id));

-- No update policy: a recorded response is never rewritten, or the replay would
-- stop matching what the first caller actually received.

create or replace function wh.purge_expired_idempotency_keys()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.idempotency_keys where expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function wh.purge_expired_idempotency_keys() is
  'Housekeeping for expired keys. Called by scheduled maintenance; safe to run at any time.';
