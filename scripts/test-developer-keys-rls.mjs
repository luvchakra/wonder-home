#!/usr/bin/env node
/**
 * Partner keys (story 18-008): the table is the server's alone.
 *
 * No household session — not even the Admin who created a key — can read a
 * key's hash, list another household's keys, or write one directly. The
 * constraints are the other half: a key's prefix and hash have exactly the
 * shape the server writes, and its scopes are only ever the closed set.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_developer_keys_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const OUTSIDER = "22222222-2222-4222-8222-222222222222";
const HASH = "a".repeat(64);

let household = "";
let headMember = "";

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${HEAD}', 'head@example.test'), ('${OUTSIDER}', 'outsider@example.test');`, options);
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Key Home', 'Head');`, options).split(" ");
  asProfile(OUTSIDER, `select wh.create_household('Outsider Home', 'Outsider');`, options);
  psql(
    `insert into public.developer_api_keys (household_id, name, environment, key_prefix, key_hash, scopes, created_by_member_id)
     values ('${household}', 'Shopping app', 'live', 'whk_live_Ab12', '${HASH}', array['groceries.read'], '${headMember}');`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("no session, however privileged, reads a key back", () => {
  for (const profile of [HEAD, OUTSIDER]) {
    assert.equal(asProfile(profile, `select count(*) from public.developer_api_keys;`, options), "0");
  }
});

test("no session writes, changes or revokes a key directly", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.developer_api_keys (household_id, name, environment, key_prefix, key_hash, scopes) values ('${household}', 'Forged', 'live', 'whk_live_Zz99', '${"b".repeat(64)}', array['groceries.write']);`,
      options,
    ),
    "a household session created a key",
  );
  asProfile(HEAD, `update public.developer_api_keys set scopes = array['groceries.write'];`, options);
  asProfile(HEAD, `delete from public.developer_api_keys;`, options);
  assert.equal(psql(`select array_to_string(scopes, ',') from public.developer_api_keys;`, options), "groceries.read", "a household session changed or removed a key");
});

test("a key's shape and scopes are closed", () => {
  const insert = (prefix, hash, scopes, environment = "live") =>
    psql(
      `insert into public.developer_api_keys (household_id, name, environment, key_prefix, key_hash, scopes) values ('${household}', 'X', '${environment}', '${prefix}', '${hash}', ${scopes});`,
      options,
    );
  assert.throws(() => insert("whk_live_Ab1", "c".repeat(64), "array['groceries.read']"), "a short prefix");
  assert.throws(() => insert("whk_live_Cd34", "C".repeat(64), "array['groceries.read']"), "an uppercase hash");
  assert.throws(() => insert("whk_live_Cd34", "c".repeat(64), "array['bills.pay']"), "a scope outside the set");
  assert.throws(() => insert("whk_live_Cd34", "c".repeat(64), "array[]::text[]"), "no scope at all");
  assert.throws(() => insert("whk_live_Cd34", "c".repeat(64), "array['groceries.read']", "production"), "an unknown environment");
  assert.throws(() => insert("whk_live_Cd34", HASH, "array['groceries.read']"), "the same hash twice");
  insert("whk_test_Cd34", "c".repeat(64), "array['household.read','groceries.read','groceries.write']", "sandbox");
});
