-- Platform settings (owner, 2026-11-07): small, non-secret switches that
-- platform staff change in the portal with no redeploy. The first is
-- 'landing.variant' ('new' | 'classic'), which signed-out visitors see at "/".
--
-- Readable by everyone (it holds only presentation switches, never a secret
-- or anything about a household), so the per-server cache may keep it
-- (packages/core/src/lib/platform-cache.ts). Written only through
-- public.platform_setting_set, executable by the service role alone; the
-- server calls it after requirePlatformAdmin. Every change is an append-only
-- event row.
--
-- Safe in either order: no existing data changes; code reads a missing row as
-- the default ('new').
--
-- Rollback: drop function public.platform_setting_set(text, text, uuid);
-- drop table public.platform_setting_events; drop table public.platform_settings;

create table if not exists public.platform_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]{1,63}$'),
  value text not null check (char_length(value) <= 200),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint platform_settings_landing_variant check (key <> 'landing.variant' or value in ('new', 'classic'))
);

comment on table public.platform_settings is
  'Non-secret platform-wide switches changed by platform staff in the portal. Public read; writes only through platform_setting_set (service role).';

create index if not exists platform_settings_updated_by_idx on public.platform_settings (updated_by);

create table if not exists public.platform_setting_events (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  old_value text,
  new_value text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.platform_setting_events is
  'Append-only: every change to a platform setting, by whom. Service role only.';

create index if not exists platform_setting_events_created_idx on public.platform_setting_events (created_at desc);
create index if not exists platform_setting_events_actor_idx on public.platform_setting_events (actor_profile_id);

alter table public.platform_settings enable row level security;
alter table public.platform_setting_events enable row level security;

drop policy if exists platform_settings_read on public.platform_settings;
create policy platform_settings_read on public.platform_settings for select to authenticated, anon using (true);
drop policy if exists platform_setting_events_no_client_access on public.platform_setting_events;
create policy platform_setting_events_no_client_access on public.platform_setting_events for all to anon, authenticated using (false) with check (false);

revoke all on public.platform_settings from anon, authenticated;
grant select on public.platform_settings to anon, authenticated;
revoke all on public.platform_setting_events from anon, authenticated;

create or replace function wh.platform_setting_events_append_only()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.actor_profile_id is null and old.actor_profile_id is not null
     and new.id = old.id and new.key = old.key
     and new.old_value is not distinct from old.old_value
     and new.new_value = old.new_value
     and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'platform setting events are append-only' using errcode = '42501';
end;
$$;

create or replace trigger platform_setting_events_append_only
  before update or delete on public.platform_setting_events
  for each row execute function wh.platform_setting_events_append_only();

create or replace function public.platform_setting_set(p_key text, p_value text, p_actor uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_old text;
begin
  select value into v_old from public.platform_settings where key = p_key;
  insert into public.platform_settings (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), p_actor)
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.platform_setting_events (key, old_value, new_value, actor_profile_id) values (p_key, v_old, p_value, p_actor);
end;
$$;

revoke all on function public.platform_setting_set(text, text, uuid) from public, anon, authenticated;
grant execute on function public.platform_setting_set(text, text, uuid) to service_role;
