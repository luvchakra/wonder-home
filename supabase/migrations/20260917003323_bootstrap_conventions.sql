-- WonderHome migration baseline (story 00-004).
-- Applied to the wonder-home Supabase project as version 20260917003323.
--
-- Establishes the conventions every later migration depends on, and nothing
-- else: domain tables belong to their own module's migration, not here.
--
-- Conventions fixed by database/SUPABASE-DATABASE.md:
--   * UUID primary keys (gen_random_uuid(), built into PostgreSQL 13+).
--   * Mutable entities carry created_at/updated_at; updated_at is maintained by
--     a trigger rather than by application code, so a direct SQL fix or an
--     admin-client write cannot silently leave it stale.
--   * Every household-owned table carries household_id and enables RLS.
--   * RLS helper functions live in the `wh` schema, are SECURITY DEFINER and
--     pin search_path, so a policy cannot be subverted by a caller-controlled
--     search_path.

create schema if not exists wh;

comment on schema wh is
  'WonderHome internal helpers (RLS scope functions, trigger functions). Not a domain schema.';

-- Helpers are called from RLS policies, which execute as the querying role, so
-- the role needs USAGE on the schema. Function EXECUTE is granted per function.
grant usage on schema wh to authenticated, service_role;

create or replace function wh.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function wh.set_updated_at() is
  'BEFORE UPDATE trigger: keeps updated_at authoritative regardless of the writer.';
