-- Platform settings saved in the admin portal instead of Vercel (owner,
-- 2026-11-07: "Don't have a config in Vercel unless absolutely necessary").
--
-- Not public.platform_settings (20261107200000): that table holds public
-- presentation switches anyone may read, such as the landing-page variant.
-- This one holds deployment configuration and secrets and is service role only.
--
-- One row per setting a staff member saved. The registry of what may be saved
-- is in code (packages/core/src/platform/settings/registry.ts); a key not in
-- it is never read. A non-secret value is kept here as text; a secret is kept
-- only in Supabase Vault (encrypted at rest with the project's key), with its
-- last four characters beside it for the screen.
--
-- Nothing here is reachable from a session: the table denies anon and
-- authenticated, and every function is executable by the service role alone.
-- The server calls them only after its own platform-staff check
-- (apps/web/app/platform-admin/settings-actions.ts).
--
-- Every change writes an audit_events row (household_id null, event_type
-- 'platform.config_changed'): old and new value for a setting, only
-- "changed" for a secret. More than 20 changes a minute by one person are
-- refused.
--
-- Safe in either order: the code reads the environment when this table or
-- these functions are missing, so the deploy and the migration can land in
-- any order. A database without Vault (a local test database) still loads
-- this migration; saving a secret there raises, as with the careers key.
--
-- Rollback: drop function public.platform_config_set(text, text, uuid);
-- drop function public.platform_config_secret_set(text, text, uuid);
-- drop function public.platform_config_clear(text, uuid);
-- drop function public.platform_config_read(); drop function public.platform_config_status();
-- drop function wh.platform_config_guard(text, uuid);
-- drop table public.platform_config;
-- delete from vault.secrets where name like 'wonderhome_config_%';

create table if not exists public.platform_config (
  key text primary key check (key ~ '^[A-Z][A-Z0-9_]{2,80}$'),
  secret boolean not null default false,
  value text check (value is null or char_length(value) <= 4096),
  vault_secret_id uuid,
  value_last4 text check (value_last4 is null or char_length(value_last4) = 4),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  check ((secret and value is null) or (not secret and vault_secret_id is null and value_last4 is null))
);

comment on table public.platform_config is
  'Settings saved by platform staff, laid over the deployment environment. Secrets live in Vault; only their last four characters are here. Service role only.';

create index if not exists platform_config_updated_by_idx on public.platform_config (updated_by);

alter table public.platform_config enable row level security;

drop policy if exists platform_config_no_client_read on public.platform_config;
create policy platform_config_no_client_read on public.platform_config for select to authenticated using (false);
-- No insert, update or delete policy: with row-level security on, every write
-- from a session is refused; only the service role's functions below write.

revoke all on public.platform_config from anon, authenticated;

-- The settings audit trail and its rate limit read this.
create index if not exists audit_events_platform_config_idx
  on public.audit_events (created_at desc)
  where household_id is null and event_type = 'platform.config_changed';

-- Shared checks: a well-formed key, a known actor, and the rate limit.
create or replace function wh.platform_config_guard(p_key text, p_actor uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if p_key is null or p_key !~ '^[A-Z][A-Z0-9_]{2,80}$' then
    raise exception 'not a setting name' using errcode = '22023';
  end if;
  if p_actor is null or not exists (
    select 1 from public.platform_admins a where a.profile_id = p_actor and a.status = 'active'
  ) then
    raise exception 'not platform staff' using errcode = '42501';
  end if;
  if (
    select count(*) from public.audit_events e
    where e.household_id is null and e.event_type = 'platform.config_changed'
      and e.actor_profile_id = p_actor and e.created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'rate_limited: too many setting changes in a minute' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function wh.platform_config_guard(text, uuid) from public, anon, authenticated;

-- Saves a non-secret setting; the audit row carries the old and new value.
create or replace function public.platform_config_set(p_key text, p_value text, p_actor uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_old text;
  v_was_secret boolean;
begin
  perform wh.platform_config_guard(p_key, p_actor);
  if p_value is null or char_length(p_value) > 4096 then
    raise exception 'value missing or too long' using errcode = '22023';
  end if;
  select value, secret into v_old, v_was_secret from public.platform_config where key = p_key;
  if v_was_secret then
    raise exception 'that setting is a secret' using errcode = '22023';
  end if;
  insert into public.platform_config (key, secret, value, updated_at, updated_by)
  values (p_key, false, p_value, now(), p_actor)
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.audit_events (household_id, actor_profile_id, event_type, target_table, metadata)
  values (null, p_actor, 'platform.config_changed', 'platform_config',
          jsonb_build_object('key', p_key, 'secret', false, 'action', 'set', 'old', v_old, 'new', p_value));
end;
$$;

-- Saves (or replaces) a secret in Vault; the audit row says only that it changed.
create or replace function public.platform_config_secret_set(p_key text, p_value text, p_actor uuid)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_secret uuid;
  v_last4 text;
  v_name text := 'wonderhome_config_' || lower(p_key);
begin
  perform wh.platform_config_guard(p_key, p_actor);
  if p_value is null or char_length(p_value) < 4 or char_length(p_value) > 4096 then
    raise exception 'value missing or too long' using errcode = '22023';
  end if;
  if exists (select 1 from public.platform_config where key = p_key and not secret) then
    raise exception 'that setting is not a secret' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_namespace where nspname = 'vault') then
    raise exception 'vault is not available' using errcode = '55000';
  end if;
  v_last4 := case when char_length(p_value) >= 12 then right(p_value, 4) else null end;
  select vault_secret_id into v_secret from public.platform_config where key = p_key;
  if v_secret is null then
    select id into v_secret from vault.secrets where name = v_name;
  end if;
  if v_secret is null then
    v_secret := vault.create_secret(p_value, v_name, 'WonderHome platform setting ' || p_key);
  else
    perform vault.update_secret(v_secret, p_value);
  end if;
  insert into public.platform_config (key, secret, value, vault_secret_id, value_last4, updated_at, updated_by)
  values (p_key, true, null, v_secret, v_last4, now(), p_actor)
  on conflict (key) do update set vault_secret_id = excluded.vault_secret_id, value_last4 = excluded.value_last4, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.audit_events (household_id, actor_profile_id, event_type, target_table, metadata)
  values (null, p_actor, 'platform.config_changed', 'platform_config',
          jsonb_build_object('key', p_key, 'secret', true, 'action', 'set'));
  return v_last4;
end;
$$;

-- Removes a saved value: the reader goes back to the environment, then its default.
create or replace function public.platform_config_clear(p_key text, p_actor uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_row public.platform_config;
begin
  perform wh.platform_config_guard(p_key, p_actor);
  select * into v_row from public.platform_config where key = p_key;
  if not found then
    return;
  end if;
  -- The Vault row is overwritten with nothing rather than kept, so no copy of the secret stays.
  if v_row.vault_secret_id is not null and exists (select 1 from pg_namespace where nspname = 'vault') then
    perform vault.update_secret(v_row.vault_secret_id, '');
  end if;
  delete from public.platform_config where key = p_key;
  insert into public.audit_events (household_id, actor_profile_id, event_type, target_table, metadata)
  values (null, p_actor, 'platform.config_changed', 'platform_config',
          case when v_row.secret
            then jsonb_build_object('key', p_key, 'secret', true, 'action', 'clear')
            else jsonb_build_object('key', p_key, 'secret', false, 'action', 'clear', 'old', v_row.value, 'new', null) end);
end;
$$;

-- Every saved value, secrets decrypted, for the server's own readers. Never for a screen.
create or replace function public.platform_config_read()
  returns table (key text, value text)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  return query select s.key, s.value from public.platform_config s where not s.secret and s.value is not null;
  if exists (select 1 from pg_namespace where nspname = 'vault') then
    return query
      select s.key, d.decrypted_secret::text
      from public.platform_config s
      join vault.decrypted_secrets d on d.id = s.vault_secret_id
      where s.secret and coalesce(d.decrypted_secret, '') <> '';
  end if;
end;
$$;

-- What a screen may show: values of settings, only the last four of secrets.
create or replace function public.platform_config_status()
  returns table (key text, secret boolean, value text, value_last4 text, updated_at timestamptz, updated_by uuid)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select s.key, s.secret, case when s.secret then null else s.value end, s.value_last4, s.updated_at, s.updated_by
  from public.platform_config s;
$$;

revoke all on function public.platform_config_set(text, text, uuid) from public, anon, authenticated;
revoke all on function public.platform_config_secret_set(text, text, uuid) from public, anon, authenticated;
revoke all on function public.platform_config_clear(text, uuid) from public, anon, authenticated;
revoke all on function public.platform_config_read() from public, anon, authenticated;
revoke all on function public.platform_config_status() from public, anon, authenticated;
grant execute on function public.platform_config_set(text, text, uuid) to service_role;
grant execute on function public.platform_config_secret_set(text, text, uuid) to service_role;
grant execute on function public.platform_config_clear(text, uuid) to service_role;
grant execute on function public.platform_config_read() to service_role;
grant execute on function public.platform_config_status() to service_role;
