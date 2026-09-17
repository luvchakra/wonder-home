#!/usr/bin/env node
/**
 * Role assignment authorization tests (story 01-003).
 *
 * The story asks for positive and negative authorization cases and for role
 * changes to take effect server-side immediately. Both are asserted here
 * against the real policies: the permission catalogue in TypeScript and the RLS
 * policy in SQL must refuse the same things, and neither is load-bearing alone.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_roles_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const ADULT = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";

let household = "";
let adminMember = "";
let adultMember = "";
let outsiderMember = "";

/** Adds a member with an existing account, the way an accepted invite would. */
function addMember(profileId, displayName, role) {
  // household_members.profile_id points at profiles, not auth.users, so the
  // profile has to exist first — exactly as wh.accept_invitation() ensures.
  psql(
    `insert into public.profiles (id, display_name) values ('${profileId}', '${displayName}')
     on conflict (id) do nothing;`,
    options,
  );
  const memberId = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${profileId}', 'adult', '${displayName}') returning id;`,
    options,
  );
  psql(
    `insert into public.household_roles (household_id, member_id, role)
     values ('${household}', '${memberId}', '${role}');`,
    options,
  );
  return memberId;
}

function rolesOf(memberId) {
  return psql(
    `select coalesce(string_agg(role, ',' order by role), '') from public.household_roles
     where member_id = '${memberId}';`,
    options,
  );
}

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'),
       ('${ADMIN}', 'priya@example.test'),
       ('${ADULT}', 'adult@example.test'),
       ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );

  [household] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");

  adminMember = addMember(ADMIN, "Priya", "administrator");
  adultMember = addMember(ADULT, "Aarav", "adult");

  // A member of a different household, for the cross-household case.
  const [otherHousehold] = asProfile(
    OUTSIDER,
    `select household_id || ' ' || member_id from wh.create_household('Outsider Home', 'Outsider');`,
    options,
  ).split(" ");
  outsiderMember = psql(
    `select id from public.household_members where household_id = '${otherHousehold}'
     and profile_id = '${OUTSIDER}';`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("the head can designate a Household Administrator", () => {
  asProfile(
    HEAD,
    `insert into public.household_roles (household_id, member_id, role)
     values ('${household}', '${adultMember}', 'administrator');`,
    options,
  );
  assert.ok(rolesOf(adultMember).includes("administrator"));
});

test("a role change takes effect immediately, with no cache to invalidate", () => {
  // The member just promoted can now do an administrator-only thing.
  const canInvite = asProfile(
    ADULT,
    `select wh.is_household_admin('${household}');`,
    options,
  );
  assert.equal(canInvite, "t");

  asProfile(
    HEAD,
    `delete from public.household_roles where household_id = '${household}'
     and member_id = '${adultMember}' and role = 'administrator';`,
    options,
  );

  assert.equal(asProfile(ADULT, `select wh.is_household_admin('${household}');`, options), "f");
});

test("an administrator cannot designate another administrator", () => {
  assert.ok(
    deniedForProfile(
      ADMIN,
      `insert into public.household_roles (household_id, member_id, role)
       values ('${household}', '${adultMember}', 'administrator');`,
      options,
    ),
    "an administrator designated another administrator",
  );
});

test("an administrator cannot remove the head's role", () => {
  const headMember = psql(
    `select owner_member_id from public.households where id = '${household}';`,
    options,
  );
  asProfile(
    ADMIN,
    `delete from public.household_roles where household_id = '${household}'
     and member_id = '${headMember}' and role = 'head';`,
    options,
  );
  assert.ok(rolesOf(headMember).includes("head"), "the head role was removed by an administrator");
});

test("an administrator can assign ordinary roles", () => {
  asProfile(
    ADMIN,
    `insert into public.household_roles (household_id, member_id, role)
     values ('${household}', '${adultMember}', 'child');`,
    options,
  );
  assert.ok(rolesOf(adultMember).includes("child"));
});

test("an ordinary adult cannot assign any role", () => {
  assert.ok(
    deniedForProfile(
      ADULT,
      `insert into public.household_roles (household_id, member_id, role)
       values ('${household}', '${adminMember}', 'child');`,
      options,
    ),
    "an adult with no admin role assigned a role",
  );
});

test("a role cannot be granted to a member of another household", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.household_roles (household_id, member_id, role)
       values ('${household}', '${outsiderMember}', 'adult');`,
      options,
    ),
    "a role was granted across a household boundary",
  );
});

test("an outsider cannot assign roles in a household they do not belong to", () => {
  assert.ok(
    deniedForProfile(
      OUTSIDER,
      `insert into public.household_roles (household_id, member_id, role)
       values ('${household}', '${adminMember}', 'administrator');`,
      options,
    ),
    "an outsider assigned a role",
  );
});

test("the household still has exactly one head after all of that", () => {
  assert.equal(
    psql(
      `select count(*) from public.household_roles
       where household_id = '${household}' and role = 'head';`,
      options,
    ),
    "1",
  );
});
