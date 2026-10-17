#!/usr/bin/env node
/**
 * Every Admin is equal.
 *
 * Any Admin, owner or not, makes another adult an Administrator or steps one
 * back. Nobody who is not an Admin can, not even for themselves. Ownership
 * ('head') is never granted or removed by a role change, so the owner always
 * stays an Admin; and a child or a househelper is never made an Admin.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_equal_admins_test";
const options = { database: DB };

const OWNER = "11111111-1111-4111-8111-111111111111";
const SECOND = "22222222-2222-4222-8222-222222222222";
const THIRD = "33333333-3333-4333-8333-333333333333";

let household = "";
let ownerMember = "";
let secondMember = "";
let thirdMember = "";
let child = "";

const roles = (member) => psql(`select coalesce(string_agg(role, ',' order by role), '') from public.household_roles where member_id = '${member}';`, options);
const grant = (member, role) => `insert into public.household_roles (household_id, member_id, role) values ('${household}', '${member}', '${role}');`;
const revoke = (member, role) => `delete from public.household_roles where member_id = '${member}' and role = '${role}';`;

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${OWNER}', 'owner@example.test'), ('${SECOND}', 'second@example.test'), ('${THIRD}', 'third@example.test');`, options);
  [household, ownerMember] = asProfile(OWNER, `select household_id || ' ' || member_id from wh.create_household('Sharma Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${SECOND}', 'Upasana'), ('${THIRD}', 'Priya');`, options);
  secondMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${SECOND}', 'adult', 'Upasana') returning id;`, options);
  thirdMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${THIRD}', 'adult', 'Priya') returning id;`, options);
  psql(`${grant(secondMember, "adult")} ${grant(thirdMember, "adult")}`, options);
  child = psql(`insert into public.household_members (household_id, member_type, display_name) values ('${household}', 'child', 'Asmi') returning id;`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("the owner makes an adult an Admin", () => {
  asProfile(OWNER, grant(secondMember, "administrator"), options);
  assert.equal(roles(secondMember), "administrator,adult");
});

test("an adult who is not an Admin cannot make anyone an Admin, themselves included", () => {
  assert.ok(deniedForProfile(THIRD, grant(thirdMember, "administrator"), options));
  assert.equal(roles(thirdMember), "adult");
});

test("an Admin who is not the owner makes another adult an Admin, and steps one back", () => {
  asProfile(SECOND, grant(thirdMember, "administrator"), options);
  assert.equal(roles(thirdMember), "administrator,adult");
  asProfile(SECOND, revoke(thirdMember, "administrator"), options);
  assert.equal(roles(thirdMember), "adult");
});

test("ownership is never granted or removed by a role change, so the owner always stays an Admin", () => {
  assert.ok(deniedForProfile(SECOND, grant(secondMember, "head"), options));
  asProfile(SECOND, revoke(ownerMember, "head"), options);
  assert.equal(roles(ownerMember), "head");
});

test("a child is never made an Admin", () => {
  assert.ok(deniedForProfile(OWNER, grant(child, "administrator"), options));
  assert.ok(deniedForProfile(SECOND, grant(child, "administrator"), options));
});
