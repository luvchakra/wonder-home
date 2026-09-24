#!/usr/bin/env node
/**
 * Tenant isolation coverage (stories 15-002, 19-002).
 *
 * The per-feature tests assert that the tables we thought about are protected.
 * This one asserts it about every table that exists, so a table added later
 * without RLS, without policies or without a household_id fails CI on the
 * migration that introduces it rather than in production months afterwards.
 *
 * It reads the live catalogue instead of a checked-in list, which is the point:
 * a list would have to be remembered, and remembering is the failure mode.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_isolation_test";
const options = { database: DB };

/**
 * Tables that legitimately hold no household_id, each for a stated reason.
 * Kept in step with scripts/lint-migration-schema.mjs.
 */
const NON_TENANT_TABLES = new Set([
  "households", // the tenant root; its own id IS the household id
  "profiles", // a person, who may belong to several households
  "plans", // platform-level plan catalogue
  "plan_features", // what a plan allows; a property of the plan, not of a tenant
  "plan_policy_events", // staff changes to a plan's usage policy; a plan belongs to no household
  "entitlement_experiments", // an experiment spans every household on the plans it names; assignment is computed, not stored
  "entitlement_experiment_events", // staff changes to an experiment; platform-level like the experiment itself
  "platform_admins", // the separate platform-admin boundary
  "homesend_share_handoffs", // a share sheet staged before sign-in; no household is known yet
  "rate_limit_counters", // counters keyed by bucket and subject (member, household or IP hash); some subjects have no household
  "plan_prices", // what a plan costs; a property of the plan, like plan_features
  "payment_provider_plans", // which provider plan backs a price; server-only configuration of the catalogue
]);

const ALICE = "11111111-1111-4111-8111-111111111111";
const MALLORY = "22222222-2222-4222-8222-222222222222";

let aliceHousehold = "";
let malloryHousehold = "";
let tables = [];

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${ALICE}', 'alice@example.test'),
       ('${MALLORY}', 'mallory@example.test');`,
    options,
  );

  [aliceHousehold] = asProfile(
    ALICE,
    `select household_id || ' ' || member_id from wh.create_household('Alice Home', 'Alice');`,
    options,
  ).split(" ");
  [malloryHousehold] = asProfile(
    MALLORY,
    `select household_id || ' ' || member_id from wh.create_household('Mallory Home', 'Mallory');`,
    options,
  ).split(" ");

  tables = psql(
    `select tablename from pg_tables where schemaname = 'public' order by tablename;`,
    options,
  )
    .split("\n")
    .filter(Boolean);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("there is something to check", () => {
  assert.ok(tables.length >= 7, `expected the schema to have tables, saw ${tables.length}`);
});

test("every public table has row level security enabled", () => {
  const unprotected = psql(
    `select c.relname from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
     order by c.relname;`,
    options,
  )
    .split("\n")
    .filter(Boolean);

  assert.deepEqual(unprotected, [], `tables without RLS: ${unprotected.join(", ")}`);
});

test("every public table has at least one policy", () => {
  const withoutPolicies = tables.filter(
    (table) =>
      psql(
        `select count(*) from pg_policies where schemaname = 'public' and tablename = '${table}';`,
        options,
      ) === "0",
  );

  // audit_events is intentionally read-only from the client, but it still has a
  // SELECT policy; a table with no policy at all is unreachable or unprotected.
  assert.deepEqual(withoutPolicies, [], `tables with no policy: ${withoutPolicies.join(", ")}`);
});

test("every household-owned table carries household_id", () => {
  const missing = tables
    .filter((table) => !NON_TENANT_TABLES.has(table))
    .filter(
      (table) =>
        psql(
          `select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = '${table}'
             and column_name = 'household_id';`,
          options,
        ) === "0",
    );

  assert.deepEqual(missing, [], `tenant tables without household_id: ${missing.join(", ")}`);
});

test("no table leaks rows across the household boundary", () => {
  const leaking = [];

  for (const table of tables) {
    if (NON_TENANT_TABLES.has(table)) continue;

    // Everything Mallory can see must belong to Mallory's household.
    const foreign = asProfile(
      MALLORY,
      `select count(*) from public.${table} where household_id <> '${malloryHousehold}';`,
      options,
    );
    if (foreign !== "0") leaking.push(`${table} (${foreign} foreign rows)`);
  }

  assert.deepEqual(leaking, [], `tables leaking across households: ${leaking.join(", ")}`);
});

test("the tenant root itself is scoped to the caller's own households", () => {
  const visible = asProfile(MALLORY, `select id from public.households order by id;`, options)
    .split("\n")
    .filter(Boolean);

  assert.deepEqual(visible, [malloryHousehold]);
  assert.notEqual(malloryHousehold, aliceHousehold);
});

test("a profile is visible only to itself and to people who share a household", () => {
  const visible = asProfile(MALLORY, `select id from public.profiles order by id;`, options)
    .split("\n")
    .filter(Boolean);

  assert.deepEqual(visible, [MALLORY], "another household's profile was readable");
});

test("every SECURITY DEFINER function pins its search_path", () => {
  const unpinned = psql(
    `select p.proname from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'wh')
       and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
         where cfg like 'search_path=%'
       )
     order by p.proname;`,
    options,
  )
    .split("\n")
    .filter(Boolean);

  assert.deepEqual(unpinned, [], `SECURITY DEFINER without search_path: ${unpinned.join(", ")}`);
});

test("the wh helper schema is not reachable by an anonymous caller", () => {
  let denied = false;
  try {
    psql(`set role anon; select wh.is_member('${aliceHousehold}');`, options);
  } catch {
    denied = true;
  }
  assert.ok(denied, "anon could call a household scope helper");
});
