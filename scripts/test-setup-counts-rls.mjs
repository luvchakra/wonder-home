#!/usr/bin/env node
/**
 * The setup counts in one call, and membership checked once per query
 * (performance pass, 2026-10-19).
 *
 * `public.household_setup_counts` returns the setup percentage's numbers in
 * one statement, through the caller's own row-level security: a member gets
 * their household's numbers, an outsider gets zeros, and anon may not call it
 * at all. The set-based membership helpers behind every policy answer for
 * the caller only.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_setup_counts_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let adultMember = "";
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
  asProfile(HEAD, `select wh.create_child_member('${household}', 'Anaya', '2016-09-18', array['${headMember}']::uuid[]);`, options);
  psql(`insert into public.pets (household_id, name, species) values ('${household}', 'Bruno', 'dog');`, options);
  outsiderHousehold = asProfile(OUTSIDER, `select household_id from wh.create_household('Other Home', 'Olu');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

const counts = (profile, householdId) =>
  JSON.parse(asProfile(profile, `select public.household_setup_counts('${householdId}')::text;`, options));

test("a member gets the household's setup counts in one call", () => {
  const facts = counts(HEAD, household);
  assert.equal(facts.members, 3);
  assert.equal(facts.children, 1);
  assert.equal(facts.childrenWithBirthdays, 1);
  assert.equal(facts.childrenWithGuardians, 1);
  assert.equal(facts.pets, 1);
  assert.equal(facts.helpers, 0);
  assert.deepEqual(counts(ADULT, household), facts);
});

test("an outsider counts nothing in someone else's household", () => {
  const facts = counts(OUTSIDER, household);
  assert.equal(facts.members, 0);
  assert.equal(facts.pets, 0);
  assert.equal(counts(OUTSIDER, outsiderHousehold).members, 1);
});

test("anon may not call it", () => {
  assert.throws(() => psql(`set role anon; select public.household_setup_counts('${household}');`, options), /permission denied/);
});

test("the set-based helpers answer for the caller only", () => {
  assert.equal(asProfile(HEAD, `select count(*) from wh.member_households();`, options), "1");
  assert.equal(asProfile(HEAD, `select count(*) from wh.admin_households();`, options), "1");
  assert.equal(asProfile(ADULT, `select count(*) from wh.admin_households();`, options), "0");
  assert.equal(asProfile(ADULT, `select member_id from wh.my_memberships();`, options), adultMember);
  assert.equal(asProfile(OUTSIDER, `select * from wh.member_households();`, options), outsiderHousehold);
});

test("no policy still checks membership row by row", () => {
  const left = psql(
    `select count(*) from pg_policies where schemaname = 'public' and coalesce(qual, '') || coalesce(with_check, '') ~ 'wh\\.(is_member|is_household_admin|member_id|may_see_child|may_change_child)\\(';`,
    options,
  );
  assert.equal(left, "0");
});
