#!/usr/bin/env node
/**
 * Connections framework tables (Connections framework).
 *
 *  - connections: an Admin creates and changes them; every member sees them (to
 *    pick in features); a non-admin cannot write; another household sees nothing.
 *  - connection_secrets: the secret is a credential — no browser-reachable role
 *    can read the `secret` column; the service role can; a non-admin cannot write.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_connections_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let adultMember = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test'), ('${OUTSIDER}', 'olu@example.test');`,
    options,
  );
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya');`, options);
  adultMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  asProfile(OUTSIDER, `select household_id from wh.create_household('Other Home', 'Olu');`, options);
});

let connection = "";

test("an Admin creates a connection; a non-admin cannot", () => {
  connection = asProfile(
    HEAD,
    `insert into public.connections (household_id, name, connector_type, params, created_by_member_id) values ('${household}', 'My school', 'browser-automation', '{"url":"https://x.test","username":"u"}', '${headMember}') returning id;`,
    options,
  ).trim();
  assert.match(connection, /[0-9a-f-]{36}/);
  assert.throws(() =>
    asProfile(
      ADULT,
      `insert into public.connections (household_id, name, connector_type, created_by_member_id) values ('${household}', 'Sneaky', 'browser-automation', '${adultMember}') returning id;`,
      options,
    ),
  );
});

test("members see connections; another household sees nothing", () => {
  assert.equal(asProfile(ADULT, `select count(*) from public.connections where household_id = '${household}';`, options).trim(), "1");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.connections where household_id = '${household}';`, options).trim(), "0");
});

test("the secret is unreadable from a browser, readable by the service role", () => {
  psql(
    `insert into public.connection_secrets (connection_id, household_id, secret) values ('${connection}', '${household}', '{"password":"s3cr3t"}');`,
    options,
  );
  // The `secret` column has no grant to authenticated, so selecting it is denied.
  assert.throws(() => asProfile(HEAD, `select secret from public.connection_secrets where connection_id = '${connection}';`, options), /permission denied|denied for/i);
  // The service role reads it.
  assert.equal(psql(`select secret->>'password' from public.connection_secrets where connection_id = '${connection}';`, options).trim(), "s3cr3t");
});

test("a non-admin cannot write a secret; another household sees no secret rows", () => {
  assert.throws(() =>
    asProfile(ADULT, `insert into public.connection_secrets (connection_id, household_id, secret) values ('${connection}', '${household}', '{"password":"x"}');`, options),
  );
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.connection_secrets where household_id = '${household}';`, options).trim(), "0");
});

test("an Admin can delete a connection, taking its secret with it", () => {
  asProfile(HEAD, `delete from public.connections where household_id = '${household}' and id = '${connection}';`, options);
  assert.equal(psql(`select count(*) from public.connections where id = '${connection}';`, options).trim(), "0");
  assert.equal(psql(`select count(*) from public.connection_secrets where connection_id = '${connection}';`, options).trim(), "0");
});

after(() => {
  psql(`drop database if exists ${DB} with (force);`, { database: "postgres" });
});
