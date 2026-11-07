-- "Move all from Vercel" (owner, 2026-11-07: "instead create one transfer
-- button which I can click and everything gets migrated").
--
-- One call saves many settings at once, in one transaction, the same way
-- platform_config_set and platform_config_secret_set (20261107210000) save one:
-- a setting's value in the table, a secret's in Vault with its last four
-- beside it, one audit_events row per key ('platform.config_changed', only
-- "changed" for a secret) and one summary row ('platform.config_moved', the
-- counts and key names, never a value).
--
-- It never overwrites: a key that already has a saved value is reported as
-- 'already' and left alone, so running it twice moves nothing the second time.
-- Two runs at once are serialised by a transaction lock.
--
-- The staff check and the 20-changes-a-minute limit run once for the whole
-- call (wh.platform_config_guard), so a move of every setting is one change
-- against the limit, not twenty-five.
--
-- Which keys may be moved is decided by the server from the registry in code
-- (packages/core/src/platform/settings/move.ts); this function checks only
-- shape. Service role only, like the rest.
--
-- Safe in either order: the code falls back to saving one setting at a time
-- when this function is missing, and nothing else reads it.
--
-- Rollback: drop function public.platform_config_import(jsonb, uuid);

create or replace function public.platform_config_import(p_items jsonb, p_actor uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_item jsonb;
  v_key text;
  v_value text;
  v_is_secret boolean;
  v_secret uuid;
  v_last4 text;
  v_has_vault boolean := exists (select 1 from pg_namespace where nspname = 'vault');
  v_results jsonb := '[]'::jsonb;
  v_moved text[] := '{}';
  v_already int := 0;
  v_unavailable int := 0;
begin
  perform wh.platform_config_guard('PLATFORM_CONFIG_IMPORT', p_actor);
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then
    raise exception 'items must be a list of at most 100' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('wonderhome.platform_config_import'));

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_key := v_item->>'key';
    v_value := v_item->>'value';
    v_is_secret := coalesce((v_item->>'secret')::boolean, false);
    if v_key is null or v_key !~ '^[A-Z][A-Z0-9_]{2,80}$' then
      raise exception 'not a setting name' using errcode = '22023';
    end if;
    if v_value is null or char_length(v_value) > 4096 or (v_is_secret and char_length(v_value) < 4) then
      raise exception 'value missing or too long' using errcode = '22023';
    end if;

    if exists (select 1 from public.platform_config where key = v_key) then
      v_already := v_already + 1;
      v_results := v_results || jsonb_build_object('key', v_key, 'status', 'already');
      continue;
    end if;

    if v_is_secret then
      if not v_has_vault then
        v_unavailable := v_unavailable + 1;
        v_results := v_results || jsonb_build_object('key', v_key, 'status', 'unavailable');
        continue;
      end if;
      v_last4 := case when char_length(v_value) >= 12 then right(v_value, 4) else null end;
      select id into v_secret from vault.secrets where name = 'wonderhome_config_' || lower(v_key);
      if v_secret is null then
        v_secret := vault.create_secret(v_value, 'wonderhome_config_' || lower(v_key), 'WonderHome platform setting ' || v_key);
      else
        perform vault.update_secret(v_secret, v_value);
      end if;
      insert into public.platform_config (key, secret, value, vault_secret_id, value_last4, updated_at, updated_by)
      values (v_key, true, null, v_secret, v_last4, now(), p_actor);
      insert into public.audit_events (household_id, actor_profile_id, event_type, target_table, metadata)
      values (null, p_actor, 'platform.config_changed', 'platform_config',
              jsonb_build_object('key', v_key, 'secret', true, 'action', 'set', 'via', 'move_from_vercel'));
    else
      insert into public.platform_config (key, secret, value, updated_at, updated_by)
      values (v_key, false, v_value, now(), p_actor);
      insert into public.audit_events (household_id, actor_profile_id, event_type, target_table, metadata)
      values (null, p_actor, 'platform.config_changed', 'platform_config',
              jsonb_build_object('key', v_key, 'secret', false, 'action', 'set', 'old', null, 'new', v_value, 'via', 'move_from_vercel'));
    end if;
    v_secret := null;
    v_moved := v_moved || v_key;
    v_results := v_results || jsonb_build_object('key', v_key, 'status', 'moved');
  end loop;

  insert into public.audit_events (household_id, actor_profile_id, event_type, target_table, metadata)
  values (null, p_actor, 'platform.config_moved', 'platform_config',
          jsonb_build_object('moved', cardinality(v_moved), 'already', v_already, 'unavailable', v_unavailable, 'keys', to_jsonb(v_moved)));

  return jsonb_build_object('items', v_results);
end;
$$;

revoke all on function public.platform_config_import(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.platform_config_import(jsonb, uuid) to service_role;
