#!/usr/bin/env node
/**
 * How the family is related (the owner, 2026-10-19): `member_relationships`.
 *
 * Every member of the household reads the rows; only an Admin adds, changes
 * or removes one. Both people are the household's own family — never a
 * househelper, never someone from another household — and a pair is related
 * once, whichever way round it was written.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_member_relationships_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let adultMember = "";
let child = "";
let helper = "";
let otherMember = "";

const insert = (who, relation, whom) =>
  `insert into public.member_relationships (household_id, member_id, relation, related_member_id) values ('${household}', '${who}', '${relation}', '${whom}');`;

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'upasana@example.test'), ('${OUTSIDER}', 'olu@example.test');`, options);
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Upasana');`, options);
  adultMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Upasana') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  child = psql(`insert into public.household_members (household_id, member_type, display_name) values ('${household}', 'child', 'Asmi') returning id;`, options);
  helper = psql(`insert into public.household_members (household_id, member_type, display_name) values ('${household}', 'helper', 'Rekha') returning id;`, options);
  const [, outsiderMember] = asProfile(OUTSIDER, `select household_id || ' ' || member_id from wh.create_household('Other Home', 'Olu');`, options).split(" ");
  otherMember = outsiderMember;
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("an Admin writes a row, and every member of the household reads it", () => {
  asProfile(HEAD, insert(headMember, "father", child), options);
  assert.equal(asProfile(HEAD, `select count(*) from public.member_relationships;`, options), "1");
  assert.equal(asProfile(ADULT, `select relation from public.member_relationships;`, options), "father");
});

test("an adult who is not an Admin cannot add, change or remove a row", () => {
  assert.ok(deniedForProfile(ADULT, insert(adultMember, "mother", child), options));
  asProfile(ADULT, `update public.member_relationships set relation = 'parent';`, options);
  asProfile(ADULT, `delete from public.member_relationships;`, options);
  assert.equal(psql(`select relation from public.member_relationships;`, options), "father");
});

test("someone from another household sees and writes nothing", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.member_relationships;`, options), "0");
  assert.ok(deniedForProfile(OUTSIDER, insert(headMember, "brother", adultMember), options));
});

test("both people are this household's family: not a helper, not someone from elsewhere, never one person twice", () => {
  assert.throws(() => asProfile(HEAD, insert(helper, "aunt", child), options), /family members/);
  assert.throws(() => asProfile(HEAD, insert(headMember, "brother", otherMember), options), /family members/);
  assert.throws(() => asProfile(HEAD, insert(headMember, "father", headMember), options), /member_relationships_two_people/);
});

test("a pair is related once, whichever way round", () => {
  assert.throws(() => asProfile(HEAD, insert(child, "daughter", headMember), options), /member_relationships_pair_key/);
  asProfile(HEAD, insert(adultMember, "wife", headMember), options);
  assert.equal(asProfile(HEAD, `select count(*) from public.member_relationships;`, options), "2");
});

test("an Admin changes and removes a row", () => {
  asProfile(HEAD, `update public.member_relationships set relation = 'parent' where member_id = '${headMember}' and related_member_id = '${child}';`, options);
  assert.equal(psql(`select relation from public.member_relationships where related_member_id = '${child}';`, options), "parent");
  asProfile(HEAD, `delete from public.member_relationships where related_member_id = '${child}';`, options);
  assert.equal(psql(`select count(*) from public.member_relationships;`, options), "1");
});

test("a relation is one to forty characters", () => {
  assert.throws(() => psql(insert(headMember, "  ", child), options), /check/);
  assert.throws(() => psql(insert(headMember, "x".repeat(41), child), options), /check/);
});
