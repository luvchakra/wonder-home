-- WonderJobs career-site key (the owner, 2026-10-21: a public Careers section
-- powered by WonderJobs; "store it encrypted at rest in this app's own
-- database", settable by admins with no redeploy, every save and clear audited).
--
-- The key itself lives only in Supabase Vault (encrypted at rest with the
-- project's own key). This app keeps beside it what a screen may show — the
-- last four characters and when it changed — and an append-only record of
-- every save and clear (who, when, the last four only).
--
-- Nothing here is reachable from a session: both tables deny every role but
-- the service role, and the four functions are executable by the service role
-- alone. The server calls them only after `requirePlatformAdmin` has passed
-- (apps/web/app/platform-admin/careers/actions.ts), and reads the key only to
-- call WonderJobs from the server (apps/web/app/_lib/careers.ts).
--
-- A database without Vault (a local test database) still loads this
-- migration: the functions raise when called, and the app falls back to the
-- WONDERJOBS_CAREERS_KEY environment variable.
--
-- Applied to the live project on 2026-10-21 in six steps (careers_key,
-- careers_key_status_fn, careers_key_read_fn, careers_key_set_fn,
-- careers_key_clear_fn, careers_key_events_append_only,
-- careers_key_events_allow_actor_erasure) with the same
-- statements as this file.
--
-- Rollback: drop function public.careers_key_set(text, uuid);
-- drop function public.careers_key_clear(uuid); drop function public.careers_key_read();
-- drop function public.careers_key_status(); drop table public.careers_key_events;
-- drop table public.careers_settings; delete from vault.secrets where name = 'wonderhome_careers_key';

create table if not exists public.careers_settings (
  id boolean primary key default true check (id),
  vault_secret_id uuid,
  key_last4 text check (key_last4 is null or char_length(key_last4) = 4),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

comment on table public.careers_settings is
  'The one WonderJobs career-site key setting: where Vault keeps the key, its last four characters, and who changed it last. Service role only.';

create index if not exists careers_settings_updated_by_idx on public.careers_settings (updated_by);

create table if not exists public.careers_key_events (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('set', 'clear')),
  key_last4 text check (key_last4 is null or char_length(key_last4) = 4),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.careers_key_events is
  'Append-only: every save and clear of the WonderJobs career-site key, by whom, with only its last four characters. Service role only.';

create index if not exists careers_key_events_created_idx on public.careers_key_events (created_at desc);
create index if not exists careers_key_events_actor_idx on public.careers_key_events (actor_profile_id);

alter table public.careers_settings enable row level security;
alter table public.careers_key_events enable row level security;

drop policy if exists careers_settings_no_client_access on public.careers_settings;
create policy careers_settings_no_client_access on public.careers_settings for all to anon, authenticated using (false) with check (false);
drop policy if exists careers_key_events_no_client_access on public.careers_key_events;
create policy careers_key_events_no_client_access on public.careers_key_events for all to anon, authenticated using (false) with check (false);

revoke all on public.careers_settings from anon, authenticated;
revoke all on public.careers_key_events from anon, authenticated;

-- An audit row is never changed or removed. The one change allowed: a deleted
-- profile's id becomes null (on delete set null), so an account can still be
-- erased; what happened and when stay as they were.
create or replace function wh.careers_key_events_append_only()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.actor_profile_id is null and old.actor_profile_id is not null
     and new.id = old.id and new.action = old.action
     and new.key_last4 is not distinct from old.key_last4
     and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'careers key events are append-only' using errcode = '42501';
end;
$$;

create or replace trigger careers_key_events_append_only
  before update or delete on public.careers_key_events
  for each row execute function wh.careers_key_events_append_only();

-- Saves (or replaces) the key in Vault and records who did it.
create or replace function public.careers_key_set(p_key text, p_actor uuid)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_secret uuid;
  v_last4 text;
begin
  if p_key is null or p_key !~ '^wjcs_[A-Za-z0-9_-]{16,200}$' then
    raise exception 'not a career site key' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_namespace where nspname = 'vault') then
    raise exception 'vault is not available' using errcode = '55000';
  end if;
  v_last4 := right(p_key, 4);
  select vault_secret_id into v_secret from public.careers_settings where id;
  if v_secret is null then
    select id into v_secret from vault.secrets where name = 'wonderhome_careers_key';
  end if;
  if v_secret is null then
    v_secret := vault.create_secret(p_key, 'wonderhome_careers_key', 'WonderJobs career-site key for WonderHome careers');
  else
    perform vault.update_secret(v_secret, p_key);
  end if;
  insert into public.careers_settings (id, vault_secret_id, key_last4, updated_at, updated_by)
  values (true, v_secret, v_last4, now(), p_actor)
  on conflict (id) do update set vault_secret_id = excluded.vault_secret_id, key_last4 = excluded.key_last4, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.careers_key_events (action, key_last4, actor_profile_id) values ('set', v_last4, p_actor);
  return v_last4;
end;
$$;

-- Removes the key from Vault; the app then uses the environment fallback, if any.
create or replace function public.careers_key_clear(p_actor uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_secret uuid;
  v_last4 text;
begin
  select vault_secret_id, key_last4 into v_secret, v_last4 from public.careers_settings where id;
  -- The Vault row is overwritten with nothing rather than removed, so no copy of the key is kept.
  if v_secret is not null and exists (select 1 from pg_namespace where nspname = 'vault') then
    perform vault.update_secret(v_secret, '');
  end if;
  insert into public.careers_settings (id, vault_secret_id, key_last4, updated_at, updated_by)
  values (true, null, null, now(), p_actor)
  on conflict (id) do update set vault_secret_id = null, key_last4 = null, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.careers_key_events (action, key_last4, actor_profile_id) values ('clear', v_last4, p_actor);
end;
$$;

-- The key itself, for the server's own call to WonderJobs. Null when none is saved.
create or replace function public.careers_key_read()
  returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_secret uuid;
  v_key text;
begin
  select vault_secret_id into v_secret from public.careers_settings where id;
  if v_secret is null or not exists (select 1 from pg_namespace where nspname = 'vault') then
    return null;
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where id = v_secret;
  return v_key;
end;
$$;

-- What a screen may show: the last four characters and when they changed.
create or replace function public.careers_key_status()
  returns table (key_last4 text, updated_at timestamptz, updated_by uuid)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select s.key_last4, s.updated_at, s.updated_by from public.careers_settings s where s.id;
$$;

revoke all on function public.careers_key_set(text, uuid) from public, anon, authenticated;
revoke all on function public.careers_key_clear(uuid) from public, anon, authenticated;
revoke all on function public.careers_key_read() from public, anon, authenticated;
revoke all on function public.careers_key_status() from public, anon, authenticated;
grant execute on function public.careers_key_set(text, uuid) to service_role;
grant execute on function public.careers_key_clear(uuid) to service_role;
grant execute on function public.careers_key_read() to service_role;
grant execute on function public.careers_key_status() to service_role;
