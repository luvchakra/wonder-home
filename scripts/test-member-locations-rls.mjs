#!/usr/bin/env node
/**
 * Where each member is, by consent (story 15-, the owner 2026-10-20).
 *
 * An adult turns their own sharing on and off; nobody else can. A child's is
 * turned on by their guardian, never by the child or another household. A
 * member reports only their own position, and only while sharing is on;
 * turning it off deletes the position. The household's adults read it, a
 * child reads only their own, and another household reads nothing.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_member_locations_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const KID = "44444444-4444-4444-8444-444444444444";

let household = "";
let headMember = "";
let adultMember = "";
let child = "";

const position = (member, lat = "19.0760") =>
  `insert into public.member_locations (household_id, member_id, latitude, longitude) values ('${household}', '${member}', ${lat}, 72.8777)
   on conflict (member_id) do update set latitude = excluded.latitude;`;

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test'), ('${OUTSIDER}', 'olu@example.test'), ('${KID}', 'anaya@example.test');`,
    options,
  );
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya'), ('${KID}', 'Anaya');`, options);
  adultMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  child = asProfile(HEAD, `select wh.create_child_member('${household}', 'Anaya', '2016-09-18', array['${headMember}']::uuid[]);`, options);
  psql(`update public.household_members set profile_id = '${KID}' where id = '${child}';`, options);
  asProfile(OUTSIDER, `select household_id from wh.create_household('Other Home', 'Olu');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("an adult shares their own position only while sharing is on, and nobody else can turn it on", () => {
  assert.throws(() => asProfile(ADULT, position(adultMember), options), /row-level security/);
  assert.throws(
    () => asProfile(HEAD, `insert into public.member_location_sharing (household_id, member_id, enabled) values ('${household}', '${adultMember}', true);`, options),
    /row-level security/,
  );
  asProfile(ADULT, `insert into public.member_location_sharing (household_id, member_id, enabled, set_by) values ('${household}', '${adultMember}', true, '${adultMember}');`, options);
  asProfile(ADULT, position(adultMember), options);
  assert.equal(asProfile(HEAD, `select count(*) from public.member_locations where member_id = '${adultMember}';`, options), "1");
  // Nobody reports a position for someone else.
  assert.throws(() => asProfile(HEAD, position(adultMember, "20.0000"), options), /row-level security/);
});

test("turning sharing off deletes the position", () => {
  asProfile(ADULT, `update public.member_location_sharing set enabled = false where member_id = '${adultMember}';`, options);
  assert.equal(psql(`select count(*) from public.member_locations where member_id = '${adultMember}';`, options), "0");
});

test("a child's sharing is their guardian's to turn on, never the child's", () => {
  assert.throws(
    () => asProfile(KID, `insert into public.member_location_sharing (household_id, member_id, enabled) values ('${household}', '${child}', true);`, options),
    /row-level security/,
  );
  asProfile(HEAD, `insert into public.member_location_sharing (household_id, member_id, enabled, set_by) values ('${household}', '${child}', true, '${headMember}');`, options);
  asProfile(KID, position(child), options);
  assert.equal(asProfile(KID, `select count(*) from public.member_location_sharing where member_id = '${child}' and enabled;`, options), "1");
  // The child cannot turn it off themselves either.
  asProfile(KID, `update public.member_location_sharing set enabled = false where member_id = '${child}';`, options);
  assert.equal(psql(`select enabled from public.member_location_sharing where member_id = '${child}';`, options), "t");
});

test("adults read positions, a child only their own, another household nothing", () => {
  asProfile(ADULT, `update public.member_location_sharing set enabled = true where member_id = '${adultMember}';`, options);
  asProfile(ADULT, position(adultMember), options);
  assert.equal(asProfile(HEAD, `select count(*) from public.member_locations;`, options), "2");
  assert.equal(asProfile(ADULT, `select count(*) from public.member_locations;`, options), "2");
  assert.equal(asProfile(KID, `select count(*) from public.member_locations;`, options), "1");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.member_locations;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.member_location_sharing;`, options), "0");
});
