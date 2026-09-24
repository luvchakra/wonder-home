#!/usr/bin/env node
/**
 * Household onboarding authorization tests (story 02-009).
 *
 * Setup state and its events belong to one household, and only an Admin may
 * move them. An invitation that names a member already on record links the
 * new account to that member — and only to an unlinked, active member of
 * the same household, so an invitation can never take over someone else.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_onboarding_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const PARTNER = "44444444-4444-4444-8444-444444444444";
const THIEF = "55555555-5555-4555-8555-555555555555";

let household = "";
let headMember = "";
let otherHousehold = "";
let otherHead = "";

function digest(token) {
  return psql(`select encode(digest('${token}', 'sha256'), 'hex');`, options);
}

function invite(token, { email, memberId = null, householdId = household, invitedBy = headMember, role = "adult" }) {
  return psql(
    `insert into public.household_invitations
       (household_id, invited_by_member_id, email, display_name, role, token_hash, expires_at, member_id)
     values ('${householdId}', '${invitedBy}', '${email}', 'Priya', '${role}',
             '${digest(token)}', now() + interval '7 days', ${memberId ? `'${memberId}'` : "null"})
     returning id;`,
    options,
  );
}

before(() => {
  buildTestDatabase(DB);
  psql(`create extension if not exists pgcrypto;`, options);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'),
       ('${ADULT}', 'adult@example.test'),
       ('${OUTSIDER}', 'outsider@example.test'),
       ('${PARTNER}', 'priya@example.test'),
       ('${THIEF}', 'thief@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");
  [otherHousehold, otherHead] = asProfile(
    OUTSIDER,
    `select household_id || ' ' || member_id from wh.create_household('Other Home', 'Olu');`,
    options,
  ).split(" ");

  // A plain adult member (not an Admin), through the real invitation path.
  invite("token-adult-000000000000000000000000", { email: "adult@example.test" });
  asProfile(ADULT, `select wh.accept_invitation('${digest("token-adult-000000000000000000000000")}', 'Asha');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("an Admin can start setup and move it on", () => {
  asProfile(HEAD, `insert into public.household_onboarding (household_id, updated_by_member_id) values ('${household}', '${headMember}');`, options);
  asProfile(HEAD, `update public.household_onboarding set step = 'basics', children = 2 where household_id = '${household}';`, options);
  assert.equal(psql(`select step || ' ' || children from public.household_onboarding where household_id = '${household}';`, options), "basics 2");
});

test("every member can see how far setup has got", () => {
  assert.equal(asProfile(ADULT, `select step from public.household_onboarding where household_id = '${household}';`, options), "basics");
});

test("a member who is not an Admin cannot move setup", () => {
  assert.ok(
    deniedForUpdate(
      ADULT,
      `update public.household_onboarding set step = 'done', status = 'completed' where household_id = '${household}';`,
      `select step from public.household_onboarding where household_id = '${household}';`,
      "basics",
      options,
    ),
    "a non-admin moved setup",
  );
});

test("another household can neither see nor start this household's setup", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.household_onboarding where household_id = '${household}';`, options), "0");
  assert.ok(
    deniedForUpdate(
      OUTSIDER,
      `update public.household_onboarding set step = 'done' where household_id = '${household}';`,
      `select step from public.household_onboarding where household_id = '${household}';`,
      "basics",
      options,
    ),
    "an outsider moved another household's setup",
  );
  assert.ok(
    deniedForProfile(OUTSIDER, `insert into public.household_onboarding (household_id) values ('${household}') on conflict do nothing;`, options) ||
      psql(`select count(*) from public.household_onboarding where household_id = '${household}';`, options) === "1",
    "an outsider started another household's setup",
  );
});

test("setup's composition stays within its limits", () => {
  assert.ok(
    deniedForProfile(HEAD, `update public.household_onboarding set adults = 0 where household_id = '${household}';`, options),
    "a household with no adults was accepted",
  );
  assert.ok(
    deniedForProfile(HEAD, `update public.household_onboarding set step = 'nowhere' where household_id = '${household}';`, options),
    "an unknown step was accepted",
  );
});

test("an Admin records setup events; nobody else can read or write them", () => {
  asProfile(HEAD, `insert into public.onboarding_events (household_id, event, step, detail) values ('${household}', 'member_added', 'adults', '{"kind":"adult"}');`, options);
  assert.equal(asProfile(HEAD, `select count(*) from public.onboarding_events where household_id = '${household}';`, options), "1");
  assert.equal(asProfile(ADULT, `select count(*) from public.onboarding_events where household_id = '${household}';`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.onboarding_events where household_id = '${household}';`, options), "0");
  assert.ok(
    deniedForProfile(ADULT, `insert into public.onboarding_events (household_id, event) values ('${household}', 'setup_completed');`, options),
    "a non-admin recorded a setup event",
  );
  assert.ok(
    deniedForProfile(OUTSIDER, `insert into public.onboarding_events (household_id, event) values ('${household}', 'setup_completed');`, options),
    "an outsider recorded another household's setup event",
  );
});

test("setup events are closed words with small details", () => {
  assert.ok(
    deniedForProfile(HEAD, `insert into public.onboarding_events (household_id, event) values ('${household}', 'anything_at_all');`, options),
    "an unknown event was accepted",
  );
  assert.ok(
    deniedForProfile(HEAD, `insert into public.onboarding_events (household_id, event, detail) values ('${household}', 'member_added', jsonb_build_object('said', repeat('x', 600)));`, options),
    "an oversized event detail was accepted",
  );
});

test("a stated age always carries the day it was said", () => {
  assert.ok(
    deniedForProfile(HEAD, `update public.household_members set age_years = 6 where id = '${headMember}';`, options),
    "an age without its date was accepted",
  );
});

test("an invitation naming an unlinked adult links the new account to that adult", () => {
  const partner = asProfile(
    HEAD,
    `insert into public.household_members (household_id, profile_id, member_type, display_name, relationship, work_arrangement)
     values ('${household}', null, 'adult', 'Priya', 'Mom', 'home') returning id;`,
    options,
  );
  const before = psql(`select count(*) from public.household_members where household_id = '${household}';`, options);
  invite("token-claim-000000000000000000000000", { email: "priya@example.test", memberId: partner });

  const joined = asProfile(PARTNER, `select member_id from wh.accept_invitation('${digest("token-claim-000000000000000000000000")}', 'Priya');`, options);
  assert.equal(joined, partner, "the invitation created a second Priya instead of linking the first");
  assert.equal(psql(`select profile_id from public.household_members where id = '${partner}';`, options), PARTNER);
  assert.equal(psql(`select work_arrangement from public.household_members where id = '${partner}';`, options), "home", "what setup recorded was lost");
  assert.equal(psql(`select count(*) from public.household_members where household_id = '${household}';`, options), before);
  assert.equal(psql(`select count(*) from public.household_roles where member_id = '${partner}' and role = 'adult';`, options), "1");
});

test("an invitation can never take over a member who already has an account", () => {
  // Names the head, who is linked: accepting must not move the head's member to the thief.
  invite("token-steal-000000000000000000000000", { email: "thief@example.test", memberId: headMember });
  const joined = asProfile(THIEF, `select member_id from wh.accept_invitation('${digest("token-steal-000000000000000000000000")}', 'Thief');`, options);
  assert.notEqual(joined, headMember);
  assert.equal(psql(`select profile_id from public.household_members where id = '${headMember}';`, options), HEAD);
});

test("an invitation cannot link a member of another household", () => {
  const stranger = asProfile(
    OUTSIDER,
    `insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${otherHousehold}', null, 'adult', 'Stranger') returning id;`,
    options,
  );
  psql(`insert into auth.users (id, email) values ('66666666-6666-4666-8666-666666666666', 'cross@example.test');`, options);
  invite("token-cross-000000000000000000000000", { email: "cross@example.test", memberId: stranger });
  const joined = asProfile(
    "66666666-6666-4666-8666-666666666666",
    `select household_id || ' ' || member_id from wh.accept_invitation('${digest("token-cross-000000000000000000000000")}', 'Cross');`,
    options,
  );
  const [joinedHousehold, joinedMember] = joined.split(" ");
  assert.equal(joinedHousehold, household);
  assert.notEqual(joinedMember, stranger);
  assert.equal(psql(`select profile_id is null from public.household_members where id = '${stranger}';`, options), "t");
  assert.ok(otherHead);
});
