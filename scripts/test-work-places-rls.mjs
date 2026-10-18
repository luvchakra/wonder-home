#!/usr/bin/env node
/**
 * Where an adult works (HomePlaces story 24-005).
 *
 * The person, the household's adults and its Admins read an office; a child,
 * a househelper and another household do not. The person sets their own; an
 * Admin may set any adult's; another adult may not set someone else's. Only
 * an adult has an office, and the row records who set it.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_work_places_test";
const options = { database: DB };

const OWNER = "11111111-1111-4111-8111-111111111111"; // Admin
const ASHA = "22222222-2222-4222-8222-222222222222"; // adult
const RAVI = "33333333-3333-4333-8333-333333333333"; // adult
const KID = "44444444-4444-4444-8444-444444444444"; // child with an account
const HELPER = "55555555-5555-4555-8555-555555555555"; // househelper
const OUTSIDER = "66666666-6666-4666-8666-666666666666";

let household = "";
let ownerMember = "";
let ashaMember = "";
let raviMember = "";
let kidMember = "";

const office = (member, setBy, name = "Cyber Hub") =>
  `insert into public.member_work_places (member_id, household_id, place_id, name, address, latitude, longitude, set_by_member_id)
   values ('${member}', '${household}', 'ChIJ_${name.replace(/\W/g, "")}', '${name}', 'Gurugram', 28.495, 77.089, '${setBy}')`;

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${OWNER}', 'o@example.test'), ('${ASHA}', 'a@example.test'), ('${RAVI}', 'r@example.test'), ('${KID}', 'k@example.test'), ('${HELPER}', 'h@example.test'), ('${OUTSIDER}', 'x@example.test');`,
    options,
  );
  [household, ownerMember] = asProfile(OWNER, `select household_id || ' ' || member_id from wh.create_household('Sharma Home', 'Kunal');`, options).split(" ");
  asProfile(OUTSIDER, `select wh.create_household('Other Home', 'Olu');`, options);
  psql(`insert into public.profiles (id, display_name) values ('${ASHA}', 'Asha'), ('${RAVI}', 'Ravi'), ('${KID}', 'Anya'), ('${HELPER}', 'Rekha');`, options);
  ashaMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ASHA}', 'adult', 'Asha') returning id;`, options);
  raviMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${RAVI}', 'adult', 'Ravi') returning id;`, options);
  kidMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${KID}', 'child', 'Anya') returning id;`, options);
  const helperMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${HELPER}', 'helper', 'Rekha') returning id;`, options);
  psql(
    `insert into public.household_roles (household_id, member_id, role) values ('${household}', '${ashaMember}', 'adult'), ('${household}', '${raviMember}', 'adult'), ('${household}', '${kidMember}', 'child'), ('${household}', '${helperMember}', 'helper');`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

const count = (profile) => asProfile(profile, `select count(*) from public.member_work_places;`, options);

test("an adult sets their own office, and records that they did", () => {
  asProfile(ASHA, `${office(ashaMember, ashaMember)};`, options);
  assert.equal(psql(`select set_by_member_id from public.member_work_places where member_id = '${ashaMember}';`, options), ashaMember);
});

test("the person, adults and Admins read it; a child, a helper and another household do not", () => {
  assert.equal(count(ASHA), "1");
  assert.equal(count(RAVI), "1");
  assert.equal(count(OWNER), "1");
  assert.equal(count(KID), "0");
  assert.equal(count(HELPER), "0");
  assert.equal(count(OUTSIDER), "0");
});

test("another adult cannot set, change or remove someone else's office", () => {
  assert.ok(deniedForProfile(RAVI, `${office(ownerMember, raviMember)};`, options));
  asProfile(RAVI, `update public.member_work_places set name = 'Somewhere else' where member_id = '${ashaMember}';`, options);
  asProfile(RAVI, `delete from public.member_work_places where member_id = '${ashaMember}';`, options);
  assert.equal(psql(`select name from public.member_work_places where member_id = '${ashaMember}';`, options), "Cyber Hub");
});

test("an Admin sets any adult's office, never in someone else's name", () => {
  asProfile(OWNER, `${office(raviMember, ownerMember, "DLF Phase 3")};`, options);
  assert.equal(psql(`select name from public.member_work_places where member_id = '${raviMember}';`, options), "DLF Phase 3");
  assert.ok(deniedForProfile(OWNER, `update public.member_work_places set set_by_member_id = '${ashaMember}' where member_id = '${raviMember}';`, options));
});

test("only an adult has an office", () => {
  assert.ok(deniedForProfile(OWNER, `${office(kidMember, ownerMember, "School")};`, options));
});

test("the person removes their own office", () => {
  asProfile(ASHA, `delete from public.member_work_places where member_id = '${ashaMember}';`, options);
  assert.equal(psql(`select count(*) from public.member_work_places where member_id = '${ashaMember}';`, options), "0");
});
