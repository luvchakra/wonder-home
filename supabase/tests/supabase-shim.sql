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
-- pg_authid's unique index. CREATE ROLE normally reports that as the clean
-- duplicate_object error (it checks first) — but under genuine concurrency
-- (proven in CI at test:db concurrency 4, 21 files racing this same block)
-- two sessions can both pass that check before either commits, and the one
-- that loses the index insert gets the raw unique_violation from
-- pg_authid_rolname_index instead. Catching both makes this safe at any
-- concurrency rather than relying on the check winning.
do $$
begin
  begin
    create role anon nologin noinherit;
  exception when duplicate_object or unique_violation then null;
  end;
  begin
    create role authenticated nologin noinherit;
  exception when duplicate_object or unique_violation then null;
  end;
  begin
    create role service_role nologin noinherit bypassrls;
  exception when duplicate_object or unique_violation then null;
  end;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- Supabase Storage: only what a migration's own `storage.buckets` row and
-- `storage.objects` RLS policies need to apply and be exercised. The real
-- project owns and enables RLS on storage.objects itself (a migration there
-- creates policies on it but cannot re-run ENABLE ROW LEVEL SECURITY, since
-- the migration role is not its owner) — here, as local superuser, the shim
-- does that one-time enable so the same policy-creation statements succeed.
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1];
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.buckets to authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
