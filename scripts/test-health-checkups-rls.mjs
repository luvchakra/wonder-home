#!/usr/bin/env node
/**
 * Health checkups: the same self/guardian/household_operational/consented-
 * viewer RLS shape 21-001 through 21-003 already established, proven again
 * for `health_checkups` (story 21-004), plus the two things unique to this
 * table: the cadence_days check constraint, and the health_appointments
 * link (`checkup_id`) it introduced.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_health_checkups_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let partnerMember = "";
let childMember = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'), ('${PARTNER}', 'priya@example.test'), ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");

  psql(`insert into public.profiles (id, display_name) values ('${PARTNER}', 'Priya');`, options);
  partnerMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${PARTNER}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${partnerMember}', 'adult');`, options);

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

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

function createCheckup(profileId, memberId, scope = "private") {
  asProfile(
    profileId,
    `insert into public.health_checkups (household_id, member_id, label, checkup_type, cadence_days, next_due_on, privacy_scope, created_by_member_id)
     values ('${household}', '${memberId}', 'Dental cleaning', 'dentist', 180, current_date + interval '30 days', '${scope}', '${memberId}');`,
    options,
  );
  return psql(`select id from public.health_checkups where member_id = '${memberId}' and privacy_scope = '${scope}' order by created_at desc limit 1;`, options);
}

test("a member can create and read their own private checkup", () => {
  const id = createCheckup(PARTNER, partnerMember);
  assert.equal(asProfile(PARTNER, `select id from public.health_checkups where id = '${id}';`, options), id);
});

test("the household administrator cannot read another adult's private checkup", () => {
  const id = psql(`select id from public.health_checkups where member_id = '${partnerMember}';`, options);
  assert.equal(
    asProfile(HEAD, `select id from public.health_checkups where id = '${id}';`, options),
    "",
    "the household administrator could read another adult's private checkup",
  );
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_checkups where id = '${id}';`, options), "0");
});

test("the household administrator cannot write another adult's private checkup via WHERE either", () => {
  const id = psql(`select id from public.health_checkups where member_id = '${partnerMember}';`, options);
  assert.ok(
    deniedForUpdate(
      HEAD,
      `update public.health_checkups set status = 'dismissed' where id = '${id}';`,
      `select status from public.health_checkups where id = '${id}';`,
      "active",
      options,
    ),
    "the household administrator could dismiss another adult's private checkup",
  );
});

test("household_operational scope is visible to any member", () => {
  const id = createCheckup(PARTNER, partnerMember, "household_operational");
  assert.equal(asProfile(HEAD, `select id from public.health_checkups where id = '${id}';`, options), id);
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_checkups where id = '${id}';`, options), "0");
});

test("a guardian can see and manage their child's checkup regardless of scope", () => {
  const id = createCheckup(HEAD, childMember, "private");
  assert.equal(asProfile(HEAD, `select id from public.health_checkups where id = '${id}';`, options), id);
  assert.ok(
    !deniedForUpdate(
      HEAD,
      `update public.health_checkups set status = 'dismissed' where id = '${id}';`,
      `select status from public.health_checkups where id = '${id}';`,
      "active",
      options,
    ),
    "a guardian could not dismiss the child they guard's checkup",
  );
});

test("a non-guardian adult cannot see or manage a child's checkup", () => {
  const id = psql(`select id from public.health_checkups where member_id = '${childMember}';`, options);
  assert.equal(
    asProfile(PARTNER, `select id from public.health_checkups where id = '${id}';`, options),
    "",
    "a non-guardian adult could read a child's checkup",
  );
});

test("selected_family visibility on a checkup requires the same consent grant health_profiles uses", () => {
  const id = createCheckup(PARTNER, partnerMember, "selected_family");
  assert.equal(
    asProfile(HEAD, `select id from public.health_checkups where id = '${id}';`, options),
    "",
    "selected_family was visible with no consent granted",
  );

  asProfile(
    PARTNER,
    `insert into public.health_consents (household_id, subject_member_id, viewer_member_id, granted_by_member_id)
     values ('${household}', '${partnerMember}', '${headMember}', '${partnerMember}');`,
    options,
  );
  assert.equal(asProfile(HEAD, `select id from public.health_checkups where id = '${id}';`, options), id);
});

test("the cadence_days constraint refuses zero or a negative cadence", () => {
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.health_checkups (household_id, member_id, label, cadence_days, next_due_on, created_by_member_id)
       values ('${household}', '${partnerMember}', 'Bad cadence', 0, current_date, '${partnerMember}');`,
      options,
    ),
    "a checkup with a zero cadence was accepted",
  );
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.health_checkups (household_id, member_id, label, cadence_days, next_due_on, created_by_member_id)
       values ('${household}', '${partnerMember}', 'Bad cadence', -30, current_date, '${partnerMember}');`,
      options,
    ),
    "a checkup with a negative cadence was accepted",
  );
});

test("health_appointments.checkup_id links an appointment to a checkup within the same household", () => {
  const checkupId = psql(`select id from public.health_checkups where member_id = '${partnerMember}' and privacy_scope = 'household_operational';`, options);
  asProfile(
    PARTNER,
    `insert into public.health_appointments (household_id, member_id, appointment_type, privacy_scope, starts_at, ends_at, checkup_id, created_by_member_id)
     values ('${household}', '${partnerMember}', 'dentist', 'private', now() + interval '3 days', now() + interval '3 days 1 hour', '${checkupId}', '${partnerMember}');`,
    options,
  );
  const linkedCount = psql(`select count(*) from public.health_appointments where checkup_id = '${checkupId}';`, options);
  assert.equal(linkedCount, "1");
});
