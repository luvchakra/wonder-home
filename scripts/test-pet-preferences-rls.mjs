#!/usr/bin/env node
/**
 * What a pet likes (the owner, 2026-10-20). Everyone in the household reads
 * it; an Admin adds, changes and removes it; another adult, a child and
 * another household cannot write it, and another household reads nothing.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_pet_preferences_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let pet = "";
let outsiderHousehold = "";

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test'), ('${OUTSIDER}', 'olu@example.test');`, options);
  [household] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya');`, options);
  const adultMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  pet = asProfile(HEAD, `insert into public.pets (household_id, name, species) values ('${household}', 'Bruno', 'Dog') returning id;`, options);
  outsiderHousehold = asProfile(OUTSIDER, `select household_id from wh.create_household('Other Home', 'Olu');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("an Admin adds, changes and removes a pet's likes", () => {
  const id = asProfile(HEAD, `insert into public.pet_preferences (household_id, pet_id, kind, subject) values ('${household}', '${pet}', 'favourite_place', 'the park') returning id;`, options);
  asProfile(HEAD, `update public.pet_preferences set subject = 'the beach' where id = '${id}';`, options);
  assert.equal(psql(`select subject from public.pet_preferences where id = '${id}';`, options), "the beach");
  asProfile(HEAD, `delete from public.pet_preferences where id = '${id}';`, options);
  assert.equal(psql(`select count(*) from public.pet_preferences;`, options), "0");
});

test("every member reads them; another adult cannot write them", () => {
  asProfile(HEAD, `insert into public.pet_preferences (household_id, pet_id, kind, subject) values ('${household}', '${pet}', 'like', 'chicken');`, options);
  assert.equal(asProfile(ADULT, `select count(*) from public.pet_preferences;`, options), "1");
  assert.throws(
    () => asProfile(ADULT, `insert into public.pet_preferences (household_id, pet_id, kind, subject) values ('${household}', '${pet}', 'dislike', 'baths');`, options),
    /row-level security/,
  );
  asProfile(ADULT, `update public.pet_preferences set subject = 'nothing';`, options);
  assert.equal(psql(`select subject from public.pet_preferences;`, options), "chicken");
});

test("another household reads nothing and cannot attach likes to someone else's pet", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.pet_preferences;`, options), "0");
  assert.throws(
    () => asProfile(OUTSIDER, `insert into public.pet_preferences (household_id, pet_id, kind, subject) values ('${outsiderHousehold}', '${pet}', 'like', 'stolen');`, options),
    /row-level security/,
  );
});
