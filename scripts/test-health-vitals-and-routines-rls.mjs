#!/usr/bin/env node
/**
 * Health vitals & measurement routines (story 21-007): the same
 * self/guardian/household_operational/consented-viewer RLS shape every
 * other health entity in this module already proves, for
 * `health_measurement_routines` and `health_vitals`, plus what is unique to
 * these two tables: the cadence_days / custom_label check constraints, and
 * `health_vitals.routine_id` linking a reading back to the routine that
 * produced it.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_health_vitals_routines_test";
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

function createRoutine(profileId, memberId, scope = "private") {
  asProfile(
    profileId,
    `insert into public.health_measurement_routines (household_id, member_id, vital_type, cadence_days, next_due_on, privacy_scope, created_by_member_id)
     values ('${household}', '${memberId}', 'blood_pressure', 7, current_date + interval '3 days', '${scope}', '${memberId}');`,
    options,
  );
  return psql(
    `select id from public.health_measurement_routines where member_id = '${memberId}' and privacy_scope = '${scope}' order by created_at desc limit 1;`,
    options,
  );
}

function createVital(profileId, memberId, scope = "private") {
  asProfile(
    profileId,
    `insert into public.health_vitals (household_id, member_id, vital_type, value, unit, privacy_scope, created_by_member_id)
     values ('${household}', '${memberId}', 'weight', 72, 'kg', '${scope}', '${memberId}');`,
    options,
  );
  return psql(`select id from public.health_vitals where member_id = '${memberId}' and privacy_scope = '${scope}' order by created_at desc limit 1;`, options);
}

test("a member can create and read their own private routine and vital", () => {
  const routineId = createRoutine(PARTNER, partnerMember);
  assert.equal(asProfile(PARTNER, `select id from public.health_measurement_routines where id = '${routineId}';`, options), routineId);

  const vitalId = createVital(PARTNER, partnerMember);
  assert.equal(asProfile(PARTNER, `select id from public.health_vitals where id = '${vitalId}';`, options), vitalId);
});

test("the household administrator cannot read another adult's private routine or vital", () => {
  const routineId = psql(`select id from public.health_measurement_routines where member_id = '${partnerMember}' and privacy_scope = 'private';`, options);
  assert.equal(
    asProfile(HEAD, `select id from public.health_measurement_routines where id = '${routineId}';`, options),
    "",
    "the household administrator could read another adult's private routine",
  );
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_measurement_routines where id = '${routineId}';`, options), "0");

  const vitalId = psql(`select id from public.health_vitals where member_id = '${partnerMember}' and privacy_scope = 'private';`, options);
  assert.equal(
    asProfile(HEAD, `select id from public.health_vitals where id = '${vitalId}';`, options),
    "",
    "the household administrator could read another adult's private vital",
  );
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_vitals where id = '${vitalId}';`, options), "0");
});

test("the household administrator cannot write another adult's private routine or vital via WHERE either", () => {
  const routineId = psql(`select id from public.health_measurement_routines where member_id = '${partnerMember}' and privacy_scope = 'private';`, options);
  assert.ok(
    deniedForUpdate(
      HEAD,
      `update public.health_measurement_routines set status = 'dismissed' where id = '${routineId}';`,
      `select status from public.health_measurement_routines where id = '${routineId}';`,
      "active",
      options,
    ),
    "the household administrator could dismiss another adult's private routine",
  );

  const vitalId = psql(`select id from public.health_vitals where member_id = '${partnerMember}' and privacy_scope = 'private';`, options);
  assert.ok(
    deniedForUpdate(
      HEAD,
      `update public.health_vitals set status = 'archived' where id = '${vitalId}';`,
      `select status from public.health_vitals where id = '${vitalId}';`,
      "active",
      options,
    ),
    "the household administrator could archive another adult's private vital",
  );
});

test("household_operational scope is visible to any member", () => {
  const routineId = createRoutine(PARTNER, partnerMember, "household_operational");
  assert.equal(asProfile(HEAD, `select id from public.health_measurement_routines where id = '${routineId}';`, options), routineId);
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_measurement_routines where id = '${routineId}';`, options), "0");

  const vitalId = createVital(PARTNER, partnerMember, "household_operational");
  assert.equal(asProfile(HEAD, `select id from public.health_vitals where id = '${vitalId}';`, options), vitalId);
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_vitals where id = '${vitalId}';`, options), "0");
});

test("a guardian can see and manage their child's routine and vital regardless of scope", () => {
  const routineId = createRoutine(HEAD, childMember, "private");
  assert.equal(asProfile(HEAD, `select id from public.health_measurement_routines where id = '${routineId}';`, options), routineId);
  assert.ok(
    !deniedForUpdate(
      HEAD,
      `update public.health_measurement_routines set status = 'dismissed' where id = '${routineId}';`,
      `select status from public.health_measurement_routines where id = '${routineId}';`,
      "active",
      options,
    ),
    "a guardian could not dismiss the child they guard's routine",
  );

  const vitalId = createVital(HEAD, childMember, "private");
  assert.equal(asProfile(HEAD, `select id from public.health_vitals where id = '${vitalId}';`, options), vitalId);
  assert.ok(
    !deniedForUpdate(
      HEAD,
      `update public.health_vitals set status = 'archived' where id = '${vitalId}';`,
      `select status from public.health_vitals where id = '${vitalId}';`,
      "active",
      options,
    ),
    "a guardian could not archive the child they guard's vital",
  );
});

test("a non-guardian adult cannot see or manage a child's routine or vital", () => {
  const routineId = psql(`select id from public.health_measurement_routines where member_id = '${childMember}';`, options);
  assert.equal(
    asProfile(PARTNER, `select id from public.health_measurement_routines where id = '${routineId}';`, options),
    "",
    "a non-guardian adult could read a child's routine",
  );

  const vitalId = psql(`select id from public.health_vitals where member_id = '${childMember}';`, options);
  assert.equal(asProfile(PARTNER, `select id from public.health_vitals where id = '${vitalId}';`, options), "", "a non-guardian adult could read a child's vital");
});

test("selected_family visibility requires the same consent grant health_profiles uses", () => {
  const routineId = createRoutine(PARTNER, partnerMember, "selected_family");
  assert.equal(
    asProfile(HEAD, `select id from public.health_measurement_routines where id = '${routineId}';`, options),
    "",
    "selected_family was visible on a routine with no consent granted",
  );

  const vitalId = createVital(PARTNER, partnerMember, "selected_family");
  assert.equal(
    asProfile(HEAD, `select id from public.health_vitals where id = '${vitalId}';`, options),
    "",
    "selected_family was visible on a vital with no consent granted",
  );

  asProfile(
    PARTNER,
    `insert into public.health_consents (household_id, subject_member_id, viewer_member_id, granted_by_member_id)
     values ('${household}', '${partnerMember}', '${headMember}', '${partnerMember}');`,
    options,
  );
  assert.equal(asProfile(HEAD, `select id from public.health_measurement_routines where id = '${routineId}';`, options), routineId);
  assert.equal(asProfile(HEAD, `select id from public.health_vitals where id = '${vitalId}';`, options), vitalId);
});

test("the cadence_days constraint refuses zero or a negative cadence", () => {
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.health_measurement_routines (household_id, member_id, vital_type, cadence_days, next_due_on, created_by_member_id)
       values ('${household}', '${partnerMember}', 'weight', 0, current_date, '${partnerMember}');`,
      options,
    ),
    "a routine with a zero cadence was accepted",
  );
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.health_measurement_routines (household_id, member_id, vital_type, cadence_days, next_due_on, created_by_member_id)
       values ('${household}', '${partnerMember}', 'weight', -7, current_date, '${partnerMember}');`,
      options,
    ),
    "a routine with a negative cadence was accepted",
  );
});

test("a custom vital_type requires a custom_label, on both tables", () => {
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.health_measurement_routines (household_id, member_id, vital_type, cadence_days, next_due_on, created_by_member_id)
       values ('${household}', '${partnerMember}', 'custom', 7, current_date, '${partnerMember}');`,
      options,
    ),
    "a custom routine with no custom_label was accepted",
  );
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.health_vitals (household_id, member_id, vital_type, value, unit, created_by_member_id)
       values ('${household}', '${partnerMember}', 'custom', 120, 'mg/dL', '${partnerMember}');`,
      options,
    ),
    "a custom vital with no custom_label was accepted",
  );
});

test("health_vitals.routine_id links a reading to a routine within the same household", () => {
  const routineId = psql(`select id from public.health_measurement_routines where member_id = '${partnerMember}' and privacy_scope = 'household_operational';`, options);
  asProfile(
    PARTNER,
    `insert into public.health_vitals (household_id, member_id, vital_type, value, secondary_value, unit, privacy_scope, routine_id, created_by_member_id)
     values ('${household}', '${partnerMember}', 'blood_pressure', 128, 82, 'mmHg', 'private', '${routineId}', '${partnerMember}');`,
    options,
  );
  const linkedCount = psql(`select count(*) from public.health_vitals where routine_id = '${routineId}';`, options);
  assert.equal(linkedCount, "1");
});
