import assert from "node:assert/strict";
import { test } from "node:test";

import { lintMigrationSource } from "./lint-migration-schema.mjs";

const GOOD_NAME = "20260917000100_bootstrap_conventions.sql";

test("accepts a household table that enables RLS and carries household_id", () => {
  const sql = `
    create table public.outcomes (
      id uuid primary key default gen_random_uuid(),
      household_id uuid not null references public.households(id),
      status text not null
    );
    alter table public.outcomes enable row level security;
  `;
  assert.deepEqual(lintMigrationSource(GOOD_NAME, sql), []);
});

test("rejects a filename without an ordering timestamp", () => {
  const problems = lintMigrationSource("add_outcomes.sql", "select 1;");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /filename must match/);
});

test("rejects a table that never enables row level security", () => {
  const sql = `
    create table public.outcomes (
      id uuid primary key,
      household_id uuid not null
    );
  `;
  const problems = lintMigrationSource(GOOD_NAME, sql);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /never enables row level security/);
});

test("rejects a tenant table with no household_id", () => {
  const sql = `
    create table public.outcomes (
      id uuid primary key,
      status text
    );
    alter table public.outcomes enable row level security;
  `;
  const problems = lintMigrationSource(GOOD_NAME, sql);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no household_id column/);
});

test("allows the tenant root itself to omit household_id", () => {
  const sql = `
    create table public.households (
      id uuid primary key default gen_random_uuid(),
      name text not null
    );
    alter table public.households enable row level security;
  `;
  assert.deepEqual(lintMigrationSource(GOOD_NAME, sql), []);
});

test("allows platform-level tables to omit household_id", () => {
  const sql = `
    create table public.plans (
      id uuid primary key,
      name text not null
    );
    alter table public.plans enable row level security;
  `;
  assert.deepEqual(lintMigrationSource(GOOD_NAME, sql), []);
});

test("rejects a SECURITY DEFINER helper that does not pin search_path", () => {
  const sql = `
    create or replace function wh.current_member_id()
    returns uuid
    language sql
    security definer
    as $$ select null::uuid $$;
  `;
  const problems = lintMigrationSource(GOOD_NAME, sql);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /does not pin search_path/);
});

test("ignores rules that only appear inside comments", () => {
  const sql = `
    -- create table public.not_real (id uuid);
    select 1;
  `;
  assert.deepEqual(lintMigrationSource(GOOD_NAME, sql), []);
});
