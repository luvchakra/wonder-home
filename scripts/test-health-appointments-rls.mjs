#!/usr/bin/env node
/**
 * Health appointments: privacy scope reuses wh.may_see_health exactly as
 * health_profiles does (story 21-002 builds on 21-001's foundation), and
 * `schedule_conflicts`' kind check constraint now accepts
 * 'health_appointment' — this file proves both against real Postgres.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_health_appointments_test";
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

function createAppointment(profileId, memberId, scope = "private") {
  asProfile(
    profileId,
    `insert into public.health_appointments (household_id, member_id, appointment_type, privacy_scope, starts_at, ends_at, created_by_member_id)
     values ('${household}', '${memberId}', 'dentist', '${scope}', now() + interval '3 days', now() + interval '3 days 1 hour', '${memberId}');`,
    options,
  );
  return psql(`select id from public.health_appointments where member_id = '${memberId}' and privacy_scope = '${scope}' order by created_at desc limit 1;`, options);
}

test("a member can create and read their own private appointment", () => {
  const id = createAppointment(PARTNER, partnerMember);
  assert.equal(asProfile(PARTNER, `select id from public.health_appointments where id = '${id}';`, options), id);
});

test("the household administrator cannot read another adult's private appointment", () => {
  const id = psql(`select id from public.health_appointments where member_id = '${partnerMember}';`, options);
  assert.equal(
    asProfile(HEAD, `select id from public.health_appointments where id = '${id}';`, options),
    "",
    "the household administrator could read another adult's private appointment",
  );
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_appointments where id = '${id}';`, options), "0");
});

test("the household administrator cannot write another adult's private appointment via WHERE either", () => {
  const id = psql(`select id from public.health_appointments where member_id = '${partnerMember}';`, options);
  assert.ok(
    deniedForUpdate(
      HEAD,
      `update public.health_appointments set notes = 'meddled' where id = '${id}';`,
      `select coalesce(notes, '') from public.health_appointments where id = '${id}';`,
      "",
      options,
    ),
    "the household administrator could update another adult's private appointment",
  );
  assert.ok(
    deniedForUpdate(
      HEAD,
      `delete from public.health_appointments where id = '${id}';`,
      `select count(*) from public.health_appointments where id = '${id}';`,
      "1",
      options,
    ),
    "the household administrator could delete another adult's private appointment",
  );
});

test("household_operational scope is visible to any member", () => {
  const id = createAppointment(PARTNER, partnerMember, "household_operational");
  assert.equal(asProfile(HEAD, `select id from public.health_appointments where id = '${id}';`, options), id);
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_appointments where id = '${id}';`, options), "0");
});

test("a guardian can see and manage their child's appointment regardless of scope", () => {
  const id = createAppointment(HEAD, childMember, "private");
  assert.equal(asProfile(HEAD, `select id from public.health_appointments where id = '${id}';`, options), id);
  assert.ok(
    !deniedForUpdate(
      HEAD,
      `update public.health_appointments set status = 'confirmed' where id = '${id}';`,
      `select status from public.health_appointments where id = '${id}';`,
      "proposed",
      options,
    ),
    "a guardian could not confirm the child they guard's appointment",
  );
});

test("a non-guardian adult cannot see or manage a child's appointment", () => {
  const id = psql(`select id from public.health_appointments where member_id = '${childMember}';`, options);
  assert.equal(
    asProfile(PARTNER, `select id from public.health_appointments where id = '${id}';`, options),
    "",
    "a non-guardian adult could read a child's appointment",
  );
  assert.ok(
    deniedForUpdate(
      PARTNER,
      `update public.health_appointments set status = 'cancelled' where id = '${id}';`,
      `select status from public.health_appointments where id = '${id}';`,
      "confirmed",
      options,
    ),
    "a non-guardian adult could cancel a child's appointment",
  );
});

test("selected_family visibility on an appointment requires the same consent grant health_profiles uses", () => {
  const id = createAppointment(PARTNER, partnerMember, "selected_family");
  assert.equal(
    asProfile(HEAD, `select id from public.health_appointments where id = '${id}';`, options),
    "",
    "selected_family was visible with no consent granted",
  );

  asProfile(
    PARTNER,
    `insert into public.health_consents (household_id, subject_member_id, viewer_member_id, granted_by_member_id)
     values ('${household}', '${partnerMember}', '${headMember}', '${partnerMember}');`,
    options,
  );
  assert.equal(asProfile(HEAD, `select id from public.health_appointments where id = '${id}';`, options), id);
});

test("the ordering constraint refuses an appointment that ends before it starts", () => {
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.health_appointments (household_id, member_id, appointment_type, starts_at, ends_at, created_by_member_id)
       values ('${household}', '${partnerMember}', 'doctor', now() + interval '1 day', now(), '${partnerMember}');`,
      options,
    ),
    "an appointment ending before it starts was accepted",
  );
});

test("schedule_conflicts now accepts the health_appointment kind", () => {
  const appointmentId = psql(`select id from public.health_appointments where member_id = '${partnerMember}' and privacy_scope = 'household_operational';`, options);
  psql(
    `insert into public.schedule_conflicts
       (household_id, left_kind, left_id, left_label, right_kind, right_id, right_label, overlap_starts_at, overlap_ends_at, proposed_action)
     values ('${household}', 'health_appointment', '${appointmentId}', 'Priya — appointment', 'event', gen_random_uuid(), 'Something else', now(), now() + interval '1 hour', 'ask_household');`,
    { database: DB },
  );
  const count = psql(`select count(*) from public.schedule_conflicts where left_kind = 'health_appointment';`, options);
  assert.equal(count, "1");
});
