#!/usr/bin/env node
/**
 * Retention cleanup audit rows are admin-only and server-written (the owner,
 * 2026-10-28; `docs/data-retention.md`).
 *
 * `public.retention_cleanup_runs` records that cleanup ran, in counts. An Admin
 * of the household reads its own history; a non-admin member, an outsider and
 * anon read nothing; and no session may write it (there is no INSERT policy —
 * the sweep writes on the admin client, like `audit_events`).
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_retention_cleanup_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let outsiderHousehold = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test'), ('${OUTSIDER}', 'olu@example.test');`,
    options,
  );
  household = asProfile(HEAD, `select household_id from wh.create_household('Chakraborty Home', 'Kunal');`, options);
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya');`, options);
  const adultMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  outsiderHousehold = asProfile(OUTSIDER, `select household_id from wh.create_household('Other Home', 'Olu');`, options);
  // The server (service role) writes a counts-only run row for the household.
  psql(
    `insert into public.retention_cleanup_runs (household_id, category, phase, affected, window_days) values ('${household}', 'availability_exceptions', 'soft_delete', 3, 90);`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

const runsSeenBy = (profile, householdId) =>
  asProfile(profile, `select count(*) from public.retention_cleanup_runs where household_id = '${householdId}';`, options);

test("an Admin reads its own household's cleanup history", () => {
  assert.equal(runsSeenBy(HEAD, household), "1");
});

test("a non-admin member reads none", () => {
  assert.equal(runsSeenBy(ADULT, household), "0");
});

test("an outsider reads none", () => {
  assert.equal(runsSeenBy(OUTSIDER, household), "0");
  assert.equal(runsSeenBy(OUTSIDER, outsiderHousehold), "0");
});

test("anon may not read it", () => {
  assert.throws(
    () => psql(`set role anon; select count(*) from public.retention_cleanup_runs;`, options),
    /permission denied/,
  );
});

test("no session may write it (server-only, no INSERT policy)", () => {
  assert.throws(
    () =>
      asProfile(
        HEAD,
        `insert into public.retention_cleanup_runs (household_id, category, phase, affected, window_days) values ('${household}', 'family_event_changes', 'soft_delete', 1, 90);`,
        options,
      ),
    /row-level security|permission denied/,
  );
});
