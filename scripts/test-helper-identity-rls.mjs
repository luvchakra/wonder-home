#!/usr/bin/env node
/**
 * Helper/service identity authorization tests (story 01-008).
 *
 * A helper account already exists as a first-class `member_type` and
 * `household_roles.role` — invitations, the household screens and the
 * permission catalogue (`ROLE_DEFAULTS.helper: []`) all already treat it as
 * one. What none of that proves on its own is that the database itself
 * refuses a helper the things a "limited account" promises to refuse: the
 * household's money, another member's private conversation, and the
 * household's own administration. Those are asserted here, against the real
 * RLS policies rather than the permission catalogue's unit tests, because a
 * TypeScript function agreeing with itself is not the same guarantee as the
 * database refusing the row.
 *
 * What a helper *is* meant to do — read and write their own schedule — is
 * asserted too, so this file proves both directions the story asks for:
 * "limited" is not the same as "locked out of the one thing their account
 * exists for."
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_helper_identity_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const HELPER = "22222222-2222-4222-8222-222222222222";
const OTHER_ADULT = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";

let household = "";
let headMember = "";
let helperMember = "";
let otherAdultMember = "";
let obligation = "";
let privateSession = "";

/** Adds a member with an existing account and a role, the way an accepted invite would. */
function addMember(profileId, displayName, memberType, role) {
  psql(
    `insert into public.profiles (id, display_name) values ('${profileId}', '${displayName}')
     on conflict (id) do nothing;`,
    options,
  );
  const memberId = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${profileId}', '${memberType}', '${displayName}') returning id;`,
    options,
  );
  psql(
    `insert into public.household_roles (household_id, member_id, role)
     values ('${household}', '${memberId}', '${role}');`,
    options,
  );
  return memberId;
}

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'),
       ('${HELPER}', 'sunita@example.test'),
       ('${OTHER_ADULT}', 'priya@example.test'),
       ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");
  asProfile(OUTSIDER, `select household_id from wh.create_household('Outsider Home', 'Outsider');`, options);

  helperMember = addMember(HELPER, "Sunita", "helper", "helper");
  otherAdultMember = addMember(OTHER_ADULT, "Priya", "adult", "adult");

  obligation = psql(
    `insert into public.obligations (household_id, name, kind, payee, amount_minor, currency, due_on, status)
     values ('${household}', 'Electricity', 'utility', 'MSEDCL', 284000, 'INR', '2026-09-25', 'received')
     returning id;`,
    options,
  );

  privateSession = psql(
    `insert into public.conversation_sessions (household_id, member_id, channel, visibility)
     values ('${household}', '${otherAdultMember}', 'text', 'private') returning id;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a helper cannot see the household's money at all", () => {
  assert.equal(
    asProfile(HELPER, `select count(*) from public.obligations where id = '${obligation}';`, options),
    "0",
    "a helper could read a financial obligation",
  );
});

test("a helper cannot write a financial obligation either", () => {
  assert.ok(
    deniedForProfile(
      HELPER,
      `insert into public.obligations (household_id, name, kind, payee, amount_minor, currency, due_on, status)
       values ('${household}', 'Planted', 'utility', 'x', 100, 'INR', '2026-09-25', 'received');`,
      options,
    ),
    "a helper could create a financial obligation",
  );
});

test("a helper cannot read another member's private conversation", () => {
  assert.equal(
    asProfile(HELPER, `select count(*) from public.conversation_sessions where id = '${privateSession}';`, options),
    "0",
    "a helper could read another member's private conversation session",
  );
});

test("a helper can read the household's role list — knowing who administers it is not privileged", () => {
  assert.equal(
    asProfile(HELPER, `select role from public.household_roles where member_id = '${headMember}';`, options),
    "head",
  );
});

test("a helper cannot grant a role — reading the list is not the same as changing it", () => {
  assert.ok(
    deniedForProfile(
      HELPER,
      `insert into public.household_roles (household_id, member_id, role)
       values ('${household}', '${helperMember}', 'administrator');`,
      options,
    ),
    "a helper could grant themselves an administrator role",
  );
});

test("a helper cannot see or create a household invitation", () => {
  assert.equal(
    asProfile(HELPER, `select count(*) from public.household_invitations where household_id = '${household}';`, options),
    "0",
  );
  assert.ok(
    deniedForProfile(
      HELPER,
      `insert into public.household_invitations (household_id, email, role, member_type, token_digest, expires_at)
       values ('${household}', 'new@example.test', 'adult', 'adult', 'x', now() + interval '7 days');`,
      options,
    ),
    "a helper could invite a new member",
  );
});

test("a helper can set their own weekly availability — the account's own reason to exist", () => {
  asProfile(
    HELPER,
    `insert into public.member_availability (household_id, member_id, day_of_week, start_time, end_time)
     values ('${household}', '${helperMember}', 1, '08:30', '12:30');`,
    options,
  );
  assert.equal(
    psql(
      `select count(*) from public.member_availability where member_id = '${helperMember}';`,
      options,
    ),
    "1",
  );
});

test("a helper cannot set another member's availability", () => {
  assert.ok(
    deniedForProfile(
      HELPER,
      `insert into public.member_availability (household_id, member_id, day_of_week, start_time, end_time)
       values ('${household}', '${otherAdultMember}', 1, '08:30', '12:30');`,
      options,
    ),
    "a helper could set another member's availability",
  );
});

test("another household's member sees none of this helper's data", () => {
  assert.equal(
    asProfile(OUTSIDER, `select count(*) from public.household_members where id = '${helperMember}';`, options),
    "0",
  );
  assert.equal(
    asProfile(OUTSIDER, `select count(*) from public.member_availability where member_id = '${helperMember}';`, options),
    "0",
  );
});
