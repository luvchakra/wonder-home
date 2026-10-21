#!/usr/bin/env node
/**
 * Health report readings (story 21-012): a reading is visible exactly as its
 * record is (`wh.may_see_health` through the record), written only by the
 * record's person or their guardian, as themselves, for the file the record
 * carries now — and never edited.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_health_readings_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let partnerMember = "";
let childMember = "";
let outsiderHousehold = "";
let outsiderMember = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'), ('${PARTNER}', 'priya@example.test'), ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );

  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");

  psql(`insert into public.profiles (id, display_name) values ('${PARTNER}', 'Priya');`, options);
  partnerMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${PARTNER}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${partnerMember}', 'adult');`, options);

  childMember = psql(`insert into public.household_members (household_id, member_type, display_name) values ('${household}', 'child', 'Kiddo') returning id;`, options);
  psql(`insert into public.member_guardians (household_id, child_member_id, guardian_member_id) values ('${household}', '${childMember}', '${headMember}');`, options);

  [outsiderHousehold, outsiderMember] = asProfile(OUTSIDER, `select household_id || ' ' || member_id from wh.create_household('Outsider Home', 'Outsider');`, options).split(" ");
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

function createRecord(profileId, memberId, scope, filePath) {
  return asProfile(
    profileId,
    `insert into public.health_records (household_id, member_id, label, record_type, privacy_scope, file_path, created_by_member_id)
     values ('${household}', '${memberId}', 'Lipid profile', 'lab_result', '${scope}', '${filePath}', '${memberId}') returning id;`,
    options,
  );
}

function readingSql(recordId, filePath, actorMemberId, householdId = household) {
  return `insert into public.health_record_readings (household_id, record_id, file_path, findings, provider, model, created_by_member_id)
          values ('${householdId}', '${recordId}', '${filePath}', '[{"key":"f1","name":"LDL Cholesterol","value":"162"}]'::jsonb, 'anthropic', 'claude-test', '${actorMemberId}')
          returning id;`;
}

test("the record's own person can keep a reading of their private report and read it back", () => {
  const path = `${household}/partner-private.pdf`;
  const recordId = createRecord(PARTNER, partnerMember, "private", path);
  const readingId = asProfile(PARTNER, readingSql(recordId, path, partnerMember), options);
  assert.ok(readingId, "the person could not keep a reading of their own report");
  assert.equal(asProfile(PARTNER, `select id from public.health_record_readings where id = '${readingId}';`, options), readingId);
});

test("an Admin cannot read another adult's private reading, and an outsider sees nothing", () => {
  const readingId = psql(`select r.id from public.health_record_readings r join public.health_records h on h.id = r.record_id where h.member_id = '${partnerMember}' limit 1;`, options);
  assert.equal(asProfile(HEAD, `select count(*) from public.health_record_readings where id = '${readingId}';`, options), "0", "the Admin could read another adult's private reading");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_record_readings where id = '${readingId}';`, options), "0");
});

test("another adult cannot keep a reading of someone else's record, even one they can see", () => {
  const path = `${household}/partner-shared.pdf`;
  const recordId = createRecord(PARTNER, partnerMember, "household_operational", path);
  assert.ok(deniedForProfile(HEAD, readingSql(recordId, path, headMember), options), "an adult kept a reading of another adult's record");
  // ...but a household_operational record's reading is visible to them.
  const readingId = asProfile(PARTNER, readingSql(recordId, path, partnerMember), options);
  assert.equal(asProfile(HEAD, `select id from public.health_record_readings where id = '${readingId}';`, options), readingId);
});

test("a reading cannot be written as somebody else, or for a file the record does not carry", () => {
  const path = `${household}/partner-other.pdf`;
  const recordId = createRecord(PARTNER, partnerMember, "private", path);
  assert.ok(deniedForProfile(PARTNER, readingSql(recordId, path, headMember), options), "a reading was written in another member's name");
  assert.ok(deniedForProfile(PARTNER, readingSql(recordId, `${household}/not-this-file.pdf`, partnerMember), options), "a reading was kept for a file the record does not carry");
});

test("an outsider cannot attach a reading to this household's record", () => {
  const recordId = psql(`select id from public.health_records where member_id = '${partnerMember}' limit 1;`, options);
  const path = psql(`select file_path from public.health_records where id = '${recordId}';`, options);
  assert.ok(deniedForProfile(OUTSIDER, readingSql(recordId, path, outsiderMember, household), options));
  assert.ok(deniedForProfile(OUTSIDER, readingSql(recordId, path, outsiderMember, outsiderHousehold), options));
});

test("a guardian keeps and sees a reading of their child's private report; another adult does not", () => {
  const path = `${household}/kiddo.pdf`;
  const recordId = createRecord(HEAD, childMember, "private", path);
  const readingId = asProfile(HEAD, readingSql(recordId, path, headMember), options);
  assert.ok(readingId, "the guardian could not keep a reading of their child's report");
  assert.equal(asProfile(PARTNER, `select count(*) from public.health_record_readings where id = '${readingId}';`, options), "0", "a non-guardian adult saw a child's reading");
  assert.ok(deniedForProfile(PARTNER, readingSql(recordId, path, partnerMember), options), "a non-guardian adult kept a reading of a child's report");
});

test("selected_family readings follow the person's consent list", () => {
  const path = `${household}/partner-selected.pdf`;
  const recordId = createRecord(PARTNER, partnerMember, "selected_family", path);
  const readingId = asProfile(PARTNER, readingSql(recordId, path, partnerMember), options);
  assert.equal(asProfile(HEAD, `select count(*) from public.health_record_readings where id = '${readingId}';`, options), "0", "selected_family reading visible with no consent");
  asProfile(
    PARTNER,
    `insert into public.health_consents (household_id, subject_member_id, viewer_member_id, granted_by_member_id)
     values ('${household}', '${partnerMember}', '${headMember}', '${partnerMember}');`,
    options,
  );
  assert.equal(asProfile(HEAD, `select id from public.health_record_readings where id = '${readingId}';`, options), readingId);
});

test("a reading is never edited, and only its writers may delete it", () => {
  const readingId = psql(
    `select r.id from public.health_record_readings r join public.health_records h on h.id = r.record_id where h.member_id = '${partnerMember}' and h.privacy_scope = 'household_operational' limit 1;`,
    options,
  );
  assert.ok(
    deniedForUpdate(PARTNER, `update public.health_record_readings set model = 'changed' where id = '${readingId}';`, `select model from public.health_record_readings where id = '${readingId}';`, "claude-test", options),
    "a reading was edited",
  );
  assert.ok(
    deniedForUpdate(HEAD, `delete from public.health_record_readings where id = '${readingId}';`, `select count(*) from public.health_record_readings where id = '${readingId}';`, "1", options),
    "an adult who can only see the record deleted its reading",
  );
  asProfile(PARTNER, `delete from public.health_record_readings where id = '${readingId}';`, options);
  assert.equal(psql(`select count(*) from public.health_record_readings where id = '${readingId}';`, options), "0", "the record's person could not delete its reading");
});

test("removing the record removes its readings", () => {
  const path = `${household}/to-remove.pdf`;
  const recordId = createRecord(PARTNER, partnerMember, "private", path);
  asProfile(PARTNER, readingSql(recordId, path, partnerMember), options);
  psql(`delete from public.health_records where id = '${recordId}';`, options);
  assert.equal(psql(`select count(*) from public.health_record_readings where record_id = '${recordId}';`, options), "0");
});

test("no policy uses a per-row membership helper", () => {
  const count = psql(
    `select count(*) from pg_policies where schemaname = 'public' and tablename = 'health_record_readings'
       and coalesce(qual, '') || coalesce(with_check, '') ~ 'wh\\.(is_member|is_household_admin|member_id)\\(';`,
    options,
  );
  assert.equal(count, "0");
});
