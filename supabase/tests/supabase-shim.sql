-- Minimal Supabase shim for running the migrations against a plain PostgreSQL
-- instance in CI.
--
-- Supabase provides these objects in a hosted project; a bare postgres:16
-- service container does not. The shim recreates only what the migrations and
-- RLS policies actually reference, so authorization tests run against the real
-- policies rather than against a mock of them.
--
-- This file is never applied to a hosted project.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  created_at timestamptz not null default now()
);

-- Supabase derives auth.uid() from the request's JWT claims. Tests set the same
-- GUC, so the policies under test see exactly what they would in production.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

-- Roles are cluster-wide, not per-database, so two test databases built at the
-- same time race here: both pass the existence check, then one CREATE loses on
-- pg_authid's unique index. Catching duplicate_object makes this safe under
-- any concurrency rather than relying on the check winning.
do $$
begin
  begin
    create role anon nologin noinherit;
  exception when duplicate_object then null;
  end;
  begin
    create role authenticated nologin noinherit;
  exception when duplicate_object then null;
  end;
  begin
    create role service_role nologin noinherit bypassrls;
  exception when duplicate_object then null;
  end;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
