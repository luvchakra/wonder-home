#!/usr/bin/env node
/**
 * HomeBrain 3.0 phase A: the Household Context Store is the server's alone.
 *
 * `household_context` holds a household's whole context before any viewer
 * filter has run — a child's view, a bill's amount, a private health note
 * are all in it. So no session reads or writes it: not a member, not an
 * Admin of that household, not anyone signed out. Only the service role
 * (the server, after `requireMembership`) does, and the row goes with its
 * household.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_household_context_test";
const options = { database: DB };

const OWNER = "11111111-1111-4111-8111-111111111111";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${OWNER}', 'owner@example.test'), ('${OUTSIDER}', 'outsider@example.test');`, options);
  household = asProfile(OWNER, `select household_id from wh.create_household('Sharma Home', 'Kunal');`, options);
  asProfile(OUTSIDER, `select wh.create_household('Other Home', 'Olu');`, options);
  // The server's write, as the service role makes it.
  psql(`insert into public.household_context (household_id, document, size_bytes) values ('${household}', '[{"id":"bill:1","summary":"Electricity is due"}]'::jsonb, 42);`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("not even the household's own Admin reads its stored context", () => {
  assert.equal(asProfile(OWNER, `select count(*) from public.household_context;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.household_context;`, options), "0");
});

test("no session writes it, or marks it stale", () => {
  // The update reaches no row it may see; the insert is refused by the policy.
  asProfile(OWNER, `update public.household_context set stale_since = now() where household_id = '${household}';`, options);
  assert.equal(psql(`select stale_since is null from public.household_context where household_id = '${household}';`, options), "t");
  assert.throws(() => asProfile(OUTSIDER, `insert into public.household_context (household_id) values ('${household}');`, options), /row-level security/);
  asProfile(OWNER, `delete from public.household_context;`, options);
  assert.equal(psql(`select size_bytes from public.household_context where household_id = '${household}';`, options), "42");
});

test("the deny-all policy is what stands between a session and the row", () => {
  assert.equal(psql(`select count(*) from pg_policies where tablename = 'household_context' and qual = 'false' and with_check = 'false';`, options), "1");
  assert.equal(psql(`select relrowsecurity from pg_class where oid = 'public.household_context'::regclass;`, options), "t");
});

test("a stored context goes with its household", () => {
  psql(`delete from public.households where id = '${household}';`, options);
  assert.equal(psql(`select count(*) from public.household_context;`, options), "0");
});
