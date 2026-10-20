#!/usr/bin/env node
/**
 * A child's companion (story 08-018): the child names it; their guardian
 * and Admins read it; an adult who is not their guardian, another household
 * and a grown-up writing for them do not.
 *
 * (Set-up shared with the child-goals test.)
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_child_companions_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const KID = "44444444-4444-4444-8444-444444444444";

let household = "";
let adultMember = "";
let child = "";
let outsiderHousehold = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test'), ('${OUTSIDER}', 'olu@example.test'), ('${KID}', 'anaya@example.test');`,
    options,
  );
  let headMember = "";
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya'), ('${KID}', 'Anaya');`, options);
  adultMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  // Kunal is Anaya's guardian; Priya, an adult of the household, is not.
  child = asProfile(HEAD, `select wh.create_child_member('${household}', 'Anaya', '2016-09-18', array['${headMember}']::uuid[]);`, options);
  psql(`update public.household_members set profile_id = '${KID}' where id = '${child}';`, options);
  outsiderHousehold = asProfile(OUTSIDER, `select household_id from wh.create_household('Other Home', 'Olu');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("the child names their cat, once, and renames it", () => {
  asProfile(KID, `insert into public.child_companions (household_id, member_id, name) values ('${household}', '${child}', 'Mishti');`, options);
  assert.throws(() => asProfile(KID, `insert into public.child_companions (household_id, member_id, name) values ('${household}', '${child}', 'Again');`, options), /duplicate key/);
  asProfile(KID, `update public.child_companions set name = 'Biscuit' where member_id = '${child}';`, options);
  assert.equal(psql(`select name from public.child_companions;`, options), "Biscuit");
  assert.throws(() => asProfile(KID, `update public.child_companions set name = '' where member_id = '${child}';`, options), /check constraint/);
  // The colour they pick (08-018): ginger until picked, one of the coats only.
  assert.equal(psql(`select coat from public.child_companions;`, options), "ginger");
  asProfile(KID, `update public.child_companions set coat = 'calico' where member_id = '${child}';`, options);
  assert.equal(psql(`select coat from public.child_companions;`, options), "calico");
  assert.throws(() => asProfile(KID, `update public.child_companions set coat = 'purple' where member_id = '${child}';`, options), /check constraint/);
});

test("their guardian reads it; the guardian cannot rename it for them", () => {
  assert.equal(asProfile(HEAD, `select name from public.child_companions;`, options), "Biscuit");
  asProfile(HEAD, `update public.child_companions set name = 'Grown-up name';`, options);
  assert.equal(psql(`select name from public.child_companions;`, options), "Biscuit");
});

test("an adult who is not their guardian and another household see nothing", () => {
  assert.equal(asProfile(ADULT, `select count(*) from public.child_companions;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.child_companions;`, options), "0");
});

test("an adult cannot make a companion for themself or for the child", () => {
  assert.throws(() => asProfile(ADULT, `insert into public.child_companions (household_id, member_id, name) values ('${household}', '${adultMember}', 'Mine');`, options), /row-level security/);
  assert.throws(() => asProfile(HEAD, `insert into public.child_companions (household_id, member_id, name) values ('${household}', '${child}', 'Theirs');`, options), /row-level security|duplicate key/);
});
