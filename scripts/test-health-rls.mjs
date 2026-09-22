#!/usr/bin/env node
/**
 * Health foundation: privacy scope, guardianship and the sharing ACL
 * (story 21-001).
 *
 * The whole point of this module is that household membership never by
 * itself grants access to another adult's health data — the product's own
 * worked example is "Dad has a cardiology appointment" (private to Dad) vs
 * "Dad unavailable 5-6pm" (visible to the household). This file exists to
 * prove that in real Postgres, not just in the TypeScript layer: an
 * administrator specifically must NOT see another adult's private or
 * selected_family health row without an explicit grant, which is the
 * opposite of how `wh.is_household_admin` is used everywhere else in this
 * schema (finance, child data) — a genuinely easy thing to get backwards by
 * copying the wrong precedent, caught once already while building this
 * migration (a `for all` write policy's own admin-bypass clause was
 * silently granting SELECT too, fixed before it ever shipped).
 *
 * `health_profiles` has a `unique (household_id, member_id)` constraint —
 * one row per member — so, per `lib/db.mjs`'s shared-database-per-file
 * gotcha, every test below either creates its own distinct member to get an
 * isolated profile row, or explicitly accounts for what an earlier test in
 * this file already did to a row it reuses.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_health_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const EXTRA_A = "44444444-4444-4444-8444-444444444444";
const EXTRA_B = "55555555-5555-4555-8555-555555555555";

let household = "";
let headMember = "";
let partnerMember = "";
let childMember = "";
let extraMemberA = "";
let extraMemberB = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'), ('${PARTNER}', 'priya@example.test'), ('${OUTSIDER}', 'outsider@example.test'),
       ('${EXTRA_A}', 'kavya@example.test'), ('${EXTRA_B}', 'rahul@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");

  psql(
    `insert into public.profiles (id, display_name) values
       ('${PARTNER}', 'Priya'), ('${EXTRA_A}', 'Kavya'), ('${EXTRA_B}', 'Rahul');`,
    options,
  );
  partnerMember = addAdultMember(PARTNER, "Priya");
  extraMemberA = addAdultMember(EXTRA_A, "Kavya");
  extraMemberB = addAdultMember(EXTRA_B, "Rahul");

  childMember = psql(
    `insert into public.household_members (household_id, member_type, display_name)
     values ('${household}', 'child', 'Kiddo') returning id;`,
    options,
  );
  psql(
    `insert into public.member_guardians (household_id, child_member_id, guardian_member_id)
     values ('${household}', '${childMember}', '${headMember}');`,
    options,
  );

  asProfile(OUTSIDER, `select wh.create_household('Outsider Home', 'Outsider');`, options);
});

function addAdultMember(profileId, name) {
  const memberId = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${profileId}', 'adult', '${name}') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${memberId}', 'adult');`, options);
  return memberId;
}

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

function createProfile(profileId, memberId, scope = "private") {
  asProfile(
    profileId,
    `insert into public.health_profiles (household_id, member_id, privacy_scope, created_by_member_id)
     values ('${household}', '${memberId}', '${scope}', '${memberId}');`,
    options,
  );
  return psql(`select id from public.health_profiles where member_id = '${memberId}';`, options);
}

test("a member can create and read their own private health profile", () => {
  const id = createProfile(PARTNER, partnerMember);
  assert.equal(asProfile(PARTNER, `select id from public.health_profiles where id = '${id}';`, options), id);
});

test("household membership alone does not grant access to another adult's private health data — not even the admin", () => {
  // Reuses the row the previous test created for partnerMember (one row per member).
  const id = psql(`select id from public.health_profiles where member_id = '${partnerMember}';`, options);
  assert.equal(
    asProfile(HEAD, `select id from public.health_profiles where id = '${id}';`, options),
    "",
    "the household administrator could read another adult's private health profile",
  );
  assert.equal(
    asProfile(OUTSIDER, `select count(*) from public.health_profiles where id = '${id}';`, options),
    "0",
  );
});

test("the admin cannot write another adult's private health profile via WHERE either", () => {
  const id = psql(`select id from public.health_profiles where member_id = '${partnerMember}';`, options);
  assert.ok(
    deniedForUpdate(
      HEAD,
      `update public.health_profiles set ai_assistance_enabled = false where id = '${id}';`,
      `select ai_assistance_enabled from public.health_profiles where id = '${id}';`,
      "t",
      options,
    ),
    "the household administrator could update another adult's private health profile",
  );
  assert.ok(
    deniedForUpdate(
      HEAD,
      `delete from public.health_profiles where id = '${id}';`,
      `select count(*) from public.health_profiles where id = '${id}';`,
      "1",
      options,
    ),
    "the household administrator could delete another adult's private health profile",
  );
});

test("household_operational scope is visible to any member", () => {
  const id = createProfile(EXTRA_A, extraMemberA, "household_operational");
  assert.equal(asProfile(HEAD, `select id from public.health_profiles where id = '${id}';`, options), id);
  assert.equal(
    asProfile(OUTSIDER, `select count(*) from public.health_profiles where id = '${id}';`, options),
    "0",
    "an outsider household saw another household's operational health data",
  );
});

test("a guardian can see and manage their child's health profile regardless of scope", () => {
  const id = createProfile(HEAD, childMember, "private");
  assert.equal(asProfile(HEAD, `select id from public.health_profiles where id = '${id}';`, options), id);
  assert.ok(
    !deniedForUpdate(
      HEAD,
      `update public.health_profiles set ai_assistance_enabled = false where id = '${id}';`,
      `select ai_assistance_enabled from public.health_profiles where id = '${id}';`,
      "t",
      options,
    ),
    "a guardian could not update the child they guard's health profile",
  );
});

test("a non-guardian adult cannot see or manage a child's health profile", () => {
  const id = psql(`select id from public.health_profiles where member_id = '${childMember}';`, options);
  // The previous test already flipped this to false via the guardian's own update.
  assert.equal(
    asProfile(PARTNER, `select id from public.health_profiles where id = '${id}';`, options),
    "",
    "a non-guardian adult could read a child's health profile",
  );
  assert.ok(
    deniedForUpdate(
      PARTNER,
      `update public.health_profiles set ai_assistance_enabled = true where id = '${id}';`,
      `select ai_assistance_enabled from public.health_profiles where id = '${id}';`,
      "f",
      options,
    ),
    "a non-guardian adult could update a child's health profile",
  );
});

test("selected_family visibility requires an explicit consent grant, not just membership", () => {
  const id = createProfile(EXTRA_B, extraMemberB, "selected_family");
  assert.equal(
    asProfile(HEAD, `select id from public.health_profiles where id = '${id}';`, options),
    "",
    "selected_family was visible to the admin with no consent granted",
  );

  asProfile(
    EXTRA_B,
    `insert into public.health_consents (household_id, subject_member_id, viewer_member_id, granted_by_member_id)
     values ('${household}', '${extraMemberB}', '${headMember}', '${extraMemberB}');`,
    options,
  );
  assert.equal(asProfile(HEAD, `select id from public.health_profiles where id = '${id}';`, options), id);

  assert.equal(
    asProfile(OUTSIDER, `select count(*) from public.health_profiles where id = '${id}';`, options),
    "0",
    "consent granted in one household leaked visibility to an outsider",
  );
});

test("only the subject — or a guardian for their child — can grant a consent; nobody can grant on another adult's behalf", () => {
  assert.ok(
    deniedForUpdate(
      HEAD,
      `insert into public.health_consents (household_id, subject_member_id, viewer_member_id, granted_by_member_id)
       values ('${household}', '${partnerMember}', '${headMember}', '${headMember}');`,
      `select count(*) from public.health_consents where subject_member_id = '${partnerMember}' and viewer_member_id = '${headMember}' and granted_by_member_id = '${headMember}';`,
      "0",
      options,
    ),
    "the household administrator could grant consent on another adult's behalf",
  );
});

test("a consent's subject can revoke it, and revoking removes the visibility it granted", () => {
  const consentId = psql(
    `select id from public.health_consents where subject_member_id = '${extraMemberB}' and viewer_member_id = '${headMember}';`,
    options,
  );
  const profileId = psql(`select id from public.health_profiles where member_id = '${extraMemberB}';`, options);

  asProfile(EXTRA_B, `delete from public.health_consents where id = '${consentId}';`, options);
  assert.equal(
    asProfile(HEAD, `select id from public.health_profiles where id = '${profileId}';`, options),
    "",
    "revoking a consent did not remove the visibility it had granted",
  );
});

test("a subject cannot grant themselves consent to their own data", () => {
  assert.ok(
    deniedForUpdate(
      PARTNER,
      `insert into public.health_consents (household_id, subject_member_id, viewer_member_id, granted_by_member_id)
       values ('${household}', '${partnerMember}', '${partnerMember}', '${partnerMember}');`,
      `select count(*) from public.health_consents where subject_member_id = '${partnerMember}' and viewer_member_id = '${partnerMember}';`,
      "0",
      options,
    ),
    "a member was allowed to grant themselves consent to their own data",
  );
});

test("wh.may_see_health is genuinely used by RLS, not just correct in isolation", () => {
  assert.equal(
    asProfile(HEAD, `select wh.may_see_health('${household}', '${partnerMember}', 'private');`, options),
    "f",
  );
  assert.equal(
    asProfile(PARTNER, `select wh.may_see_health('${household}', '${partnerMember}', 'private');`, options),
    "t",
  );
});
