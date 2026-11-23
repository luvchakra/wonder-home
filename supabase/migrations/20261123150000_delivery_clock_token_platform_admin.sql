-- The delivery clock's GitHub token is a Platform admin setting (owner, 2026-11-23: "instead of create secret through
-- query, can you create new secret entry in platform admin which i can then populate"). The owner saves it on
-- Platform admin → Integrations → Background jobs → "GitHub delivery-clock token" (GITHUB_DISPATCH_TOKEN); the
-- store keeps it in Vault (`platform_config.vault_secret_id`), like every provider secret. This replaces
-- wh.trigger_delivery_clock() (20261123120000) to read it from there, with the Vault secret named
-- `github_dispatch_token` as a fallback only. Still safe with no token: it answers 'no-token' and sends nothing.

create or replace function wh.trigger_delivery_clock()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return 'no-vault';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net' and p.proname = 'http_post'
  ) then
    return 'no-net';
  end if;
  -- Saved in Platform admin first; a cleared setting holds '' and counts as unset.
  execute 'select d.decrypted_secret from public.platform_config c join vault.decrypted_secrets d on d.id = c.vault_secret_id
           where c.key = $1 and c.secret limit 1'
    into v_token
    using 'GITHUB_DISPATCH_TOKEN';
  if v_token is null or btrim(v_token) = '' then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_token
      using 'github_dispatch_token';
  end if;
  if v_token is null or btrim(v_token) = '' then
    return 'no-token';
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
    using
      'https://api.github.com/repos/luvchakra/wonder-home/actions/workflows/delivery-clock.yml/dispatches',
      jsonb_build_object('ref', 'main'),
      jsonb_build_object(
        'Accept', 'application/vnd.github+json',
        'Authorization', 'Bearer ' || btrim(v_token),
        'Content-Type', 'application/json',
        'User-Agent', 'wonderhome-delivery-clock',
        'X-GitHub-Api-Version', '2022-11-28'
      ),
      10000;
  return 'dispatched';
end;
$$;

comment on function wh.trigger_delivery_clock() is
  'Every 5 minutes (pg_cron wonderhome-delivery-clock-github): asks GitHub to run delivery-clock.yml with the token saved in Platform admin (GITHUB_DISPATCH_TOKEN; Vault secret github_dispatch_token as a fallback). Returns no-vault, no-net or no-token and sends nothing when one is missing; Vercel then keeps delivering.';

revoke execute on function wh.trigger_delivery_clock() from public, anon, authenticated, service_role;
