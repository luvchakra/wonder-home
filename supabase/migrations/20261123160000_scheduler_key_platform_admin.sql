-- The scheduler key (CRON_SECRET) is a Platform admin setting (owner, 2026-11-23: "i don't see entry for cron
-- secret in platform admin"). Its Vault secret is the one pg_cron already sends, `cron_secret`, so saving or
-- generating it on Platform admin → Integrations → Background jobs → "Scheduler key" changes what the scheduler sends
-- and what the routes accept together (they had drifted: every dispatch answered 401). The routes also keep
-- accepting Vercel's CRON_SECRET, which Vercel's own crons send (`security/cron-auth.ts`).
--
-- Replaces two functions of 20261107210000 with one change each: the secret's Vault name for CRON_SECRET, and a
-- refusal to clear it. Grants are kept by `create or replace`. Safe before the app deploys: until a key is saved
-- here nothing changes.

create or replace function public.platform_config_secret_set(p_key text, p_value text, p_actor uuid)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_secret uuid;
  v_last4 text;
  -- The scheduler key is the Vault secret pg_cron already sends (`cron_secret`), so saving it here updates what the
  -- scheduler sends and what the routes accept in one step; they can't drift apart again.
  v_name text := case when p_key = 'CRON_SECRET' then 'cron_secret' else 'wonderhome_config_' || lower(p_key) end;
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
  -- Clearing the scheduler key would blank the Vault secret pg_cron sends and stop every scheduled call: replace it
  -- (Generate new key) instead.
  if p_key = 'CRON_SECRET' then
    raise exception 'the scheduler key can be replaced, not cleared' using errcode = '22023';
  end if;
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
