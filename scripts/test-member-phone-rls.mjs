#!/usr/bin/env node
/**
 * Story 01-011: a phone number for every member, and sign-in by phone.
 *
 * Only an Admin writes a member's number. Admins, the household's adults and
 * the member themselves read it; a child or a helper sees only their own. One
 * number is one person in a household. A verified phone sign-in links the
 * account to the member recorded with that number, with the role the
 * household gave them — a helper stays a helper. An unverified number links
 * nothing, and a removed member is not brought back.
 */
import assert from "node:assert/strict";
import { before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_member_phone_test";
const options = { database: DB };

const OWNER = "11111111-1111-4111-8111-111111111111"; // Admin
const ASHA = "22222222-2222-4222-8222-222222222222"; // adult, not an Admin
const SUNITA = "44444444-4444-4444-8444-444444444444"; // the helper, signing in by phone
const STRANGER = "55555555-5555-4555-8555-555555555555"; // unverified phone
const KID = "33333333-3333-4333-8333-333333333333"; // a child with an account

let household = "";
let helperMember = "";
let goneMember = "";
let kidMember = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at) values
       ('${OWNER}', 'owner@example.test', now(), null, null),
       ('${ASHA}', 'asha@example.test', now(), null, null),
       ('${KID}', 'kid@example.test', now(), null, null),
       ('${SUNITA}', null, null, '919876543210', now()),
       ('${STRANGER}', null, null, '919811111111', null);`,
    options,
  );
  household = asProfile(OWNER, `select household_id from wh.create_household('Sharma Home', 'Kunal');`, options);
  const asha = psql(`insert into public.profiles (id, display_name) values ('${ASHA}', 'Asha'); insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ASHA}', 'adult', 'Asha') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${asha}', 'adult');`, options);
  kidMember = psql(`insert into public.profiles (id, display_name) values ('${KID}', 'Anya'); insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${KID}', 'child', 'Anya') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${kidMember}', 'child');`, options);
  helperMember = psql(`insert into public.household_members (household_id, member_type, display_name) values ('${household}', 'helper', 'Sunita') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${helperMember}', 'helper');`, options);
  goneMember = psql(`insert into public.household_members (household_id, member_type, display_name, status) values ('${household}', 'helper', 'Old helper', 'inactive') returning id;`, options);
});

test("only an Admin records a member's phone number, in E.164", () => {
  asProfile(OWNER, `insert into public.household_member_phones (member_id, household_id, phone) values ('${helperMember}', '${household}', '+919876543210');`, options);
  assert.ok(deniedForProfile(ASHA, `insert into public.household_member_phones (member_id, household_id, phone) values ('${kidMember}', '${household}', '+919800000000');`, options));
  assert.throws(() => asProfile(OWNER, `insert into public.household_member_phones (member_id, household_id, phone) values ('${kidMember}', '${household}', '98765 43210');`, options));
});

test("one number is one person in a household", () => {
  assert.throws(() => asProfile(OWNER, `insert into public.household_member_phones (member_id, household_id, phone) values ('${kidMember}', '${household}', '+919876543210');`, options));
});

test("Admins and adults read every number; a child reads only their own", () => {
  assert.equal(asProfile(OWNER, `select count(*) from public.household_member_phones;`, options), "1");
  assert.equal(asProfile(ASHA, `select count(*) from public.household_member_phones;`, options), "1");
  assert.equal(asProfile(KID, `select count(*) from public.household_member_phones;`, options), "0");
});

test("an unverified phone links nothing", () => {
  asProfile(OWNER, `insert into public.household_member_phones (member_id, household_id, phone) values ('${goneMember}', '${household}', '+919811111111');`, options);
  assert.equal(asProfile(STRANGER, `select count(*) from public.claim_members_by_phone();`, options), "0");
});

test("a verified phone sign-in becomes the helper on record, still a helper", () => {
  assert.equal(asProfile(SUNITA, `select count(*) from public.claim_members_by_phone();`, options), "1");
  assert.equal(psql(`select profile_id from public.household_members where id = '${helperMember}';`, options), SUNITA);
  assert.equal(psql(`select string_agg(role, ',') from public.household_roles where member_id = '${helperMember}';`, options), "helper");
  // Claiming again changes nothing.
  assert.equal(asProfile(SUNITA, `select count(*) from public.claim_members_by_phone();`, options), "0");
  // She now reads her own number.
  assert.equal(asProfile(SUNITA, `select phone from public.household_member_phones;`, options), "+919876543210");
});

test("a removed member is not brought back by a phone sign-in", () => {
  psql(`update auth.users set phone_confirmed_at = now() where id = '${STRANGER}';`, options);
  assert.equal(asProfile(STRANGER, `select count(*) from public.claim_members_by_phone();`, options), "0");
  assert.equal(psql(`select coalesce(profile_id::text, 'none') from public.household_members where id = '${goneMember}';`, options), "none");
});
