#!/usr/bin/env node
/**
 * A connected school portal's sign-in (story 08-032).
 *
 * An Admin stores it; nobody reads it back. There is no select policy and the
 * select grant is revoked, so even the Admin who set it cannot read the row —
 * only the server, with the service role, can. The status function tells an
 * Admin that a portal is connected and as whom, never the password. A non-admin
 * cannot write it, and another household sees nothing.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_school_portal_credentials_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let adultMember = "";
let integration = "";
let outsiderHousehold = "";

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
  integration = psql(
    `insert into public.integrations (household_id, kind, provider, status) values ('${household}', 'school', 'loop-learning', 'connecting') returning id;`,
    options,
  );
  outsiderHousehold = asProfile(OUTSIDER, `select household_id from wh.create_household('Other Home', 'Olu');`, options);
});

test("an Admin stores a sign-in", () => {
  const id = asProfile(
    HEAD,
    `insert into public.school_portal_credentials (household_id, integration_id, portal_url, username, password, set_by_member_id) values ('${household}', '${integration}', 'https://www.looplearning.com', 'upasanaa@example.test', 'the-secret', '${headMember}') returning id;`,
    options,
  );
  assert.match(id, /[0-9a-f-]{36}/);
});

test("nobody reads the row back — not even the Admin who set it", () => {
  assert.throws(
    () => asProfile(HEAD, `select password from public.school_portal_credentials where household_id = '${household}';`, options),
    /permission denied|denied for/i,
  );
});

test("the status function tells an Admin it is connected and as whom, never the password", () => {
  const row = asProfile(HEAD, `select username || '|' || portal_url from public.school_portal_credential_status('${household}');`, options);
  assert.match(row, /upasanaa@example\.test\|https:\/\/www\.looplearning\.com/);
  // No column named password is returned by the function.
  assert.throws(() => asProfile(HEAD, `select password from public.school_portal_credential_status('${household}');`, options), /does not exist|column/i);
});

test("a non-admin adult cannot store a sign-in, and the status function tells them nothing", () => {
  assert.throws(() =>
    asProfile(
      ADULT,
      `insert into public.school_portal_credentials (household_id, integration_id, portal_url, username, password, set_by_member_id) values ('${household}', '${integration}', 'https://www.looplearning.com', 'x', 'y', '${adultMember}') returning id;`,
      options,
    ),
  );
  const row = asProfile(ADULT, `select count(*) from public.school_portal_credential_status('${household}');`, options);
  assert.equal(row.trim(), "0");
});

test("the server, with the service role, can read the sign-in to run the connector", () => {
  const pw = psql(`select password from public.school_portal_credentials where household_id = '${household}';`, options);
  assert.equal(pw.trim(), "the-secret");
});

test("another household sees nothing and cannot write into ours", () => {
  const n = asProfile(OUTSIDER, `select count(*) from public.school_portal_credential_status('${household}');`, options);
  assert.equal(n.trim(), "0");
  assert.throws(() =>
    asProfile(
      OUTSIDER,
      `insert into public.school_portal_credentials (household_id, integration_id, portal_url, username, password, set_by_member_id) values ('${household}', '${integration}', 'https://x', 'a', 'b', '${headMember}') returning id;`,
      options,
    ),
  );
});

test("an Admin can replace and clear the sign-in", () => {
  asProfile(HEAD, `update public.school_portal_credentials set password = 'rotated' where household_id = '${household}';`, options);
  assert.equal(psql(`select password from public.school_portal_credentials where household_id = '${household}';`, options).trim(), "rotated");
  asProfile(HEAD, `delete from public.school_portal_credentials where household_id = '${household}';`, options);
  assert.equal(psql(`select count(*) from public.school_portal_credentials where household_id = '${household}';`, options).trim(), "0");
});

after(() => {
  psql(`drop database if exists ${DB} with (force);`, { database: "postgres" });
});
