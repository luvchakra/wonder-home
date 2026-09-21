#!/usr/bin/env node
/**
 * Household feature flag database tests (module 16, story 16-008).
 *
 * `household_feature_flags` is readable by the household it belongs to —
 * what WonderHome has turned on for a family is not staff's business to
 * hide from the family it concerns — but writable only by the admin client
 * behind `setHouseholdFeatureFlag`, so a member cannot grant themselves an
 * experimental capability by inserting a row directly.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_feature_flags_test";
const options = { database: DB };

const HEAD = "55555555-5555-4555-8555-555555555555";
const OUTSIDER = "66666666-6666-4666-8666-666666666666";

let household = "";
let headMember = "";
let flagId = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'),
       ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");

  asProfile(OUTSIDER, `select household_id from wh.create_household('Outsider Home', 'Outsider');`, options);

  flagId = psql(
    `insert into public.household_feature_flags (household_id, flag_key, enabled, reason)
     values ('${household}', 'early_access_ai', true, 'Household opted into the beta program')
     returning id;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a household member can read a flag set for their household", () => {
  assert.equal(
    asProfile(HEAD, `select enabled from public.household_feature_flags where id = '${flagId}';`, options),
    "t",
  );
});

test("another household sees none of this household's flags", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.household_feature_flags;`, options), "0");
});

test("a member cannot set a flag directly — only the admin client may", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.household_feature_flags (household_id, flag_key, enabled, reason)
       values ('${household}', 'self_granted', true, 'Granted by nobody with the authority to');`,
      options,
    ),
    "a plain authenticated member could set their own household's feature flag, bypassing setHouseholdFeatureFlag",
  );
});

test("a member's update to an existing flag touches nothing — there is no policy that would let it", () => {
  // No UPDATE policy exists, so this matches zero rows rather than raising —
  // the same shape `agent_runs`' own "a client cannot rewrite a run" test
  // checks. The assertion that matters is the value afterward, not the exit code.
  asProfile(
    HEAD,
    `update public.household_feature_flags set enabled = false where id = '${flagId}';`,
    options,
  );
  assert.equal(
    psql(`select enabled from public.household_feature_flags where id = '${flagId}';`, options),
    "t",
    "a plain authenticated member could toggle their own household's feature flag",
  );
});
