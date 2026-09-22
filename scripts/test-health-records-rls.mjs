#!/usr/bin/env node
/**
 * Health records (story 21-005): the same self/guardian/household_operational/
 * consented-viewer RLS shape 21-001 through 21-004 already established,
 * proven again for `health_records`, plus the one thing unique to this
 * story: HomeSend's `health_document` intake kind narrows `home_send_items`
 * visibility to its own sender while it sits unconfirmed, instead of the
 * shared-inbox visibility every other kind keeps.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_health_records_test";
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

function createRecord(profileId, memberId, scope = "private") {
  asProfile(
    profileId,
    `insert into public.health_records (household_id, member_id, label, record_type, privacy_scope, created_by_member_id)
     values ('${household}', '${memberId}', 'Blood test results', 'lab_result', '${scope}', '${memberId}');`,
    options,
  );
  return psql(`select id from public.health_records where member_id = '${memberId}' and privacy_scope = '${scope}' order by created_at desc limit 1;`, options);
}

test("a member can create and read their own private record", () => {
  const id = createRecord(PARTNER, partnerMember);
  assert.equal(asProfile(PARTNER, `select id from public.health_records where id = '${id}';`, options), id);
});

test("the household administrator cannot read another adult's private record", () => {
  const id = psql(`select id from public.health_records where member_id = '${partnerMember}';`, options);
  assert.equal(
    asProfile(HEAD, `select id from public.health_records where id = '${id}';`, options),
    "",
    "the household administrator could read another adult's private record",
  );
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_records where id = '${id}';`, options), "0");
});

test("the household administrator cannot write another adult's private record via WHERE either", () => {
  const id = psql(`select id from public.health_records where member_id = '${partnerMember}';`, options);
  assert.ok(
    deniedForUpdate(
      HEAD,
      `update public.health_records set status = 'archived' where id = '${id}';`,
      `select status from public.health_records where id = '${id}';`,
      "active",
      options,
    ),
    "the household administrator could archive another adult's private record",
  );
});

test("household_operational scope is visible to any member", () => {
  const id = createRecord(PARTNER, partnerMember, "household_operational");
  assert.equal(asProfile(HEAD, `select id from public.health_records where id = '${id}';`, options), id);
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_records where id = '${id}';`, options), "0");
});

test("a guardian can see and manage their child's record regardless of scope", () => {
  const id = createRecord(HEAD, childMember, "private");
  assert.equal(asProfile(HEAD, `select id from public.health_records where id = '${id}';`, options), id);
  assert.ok(
    !deniedForUpdate(
      HEAD,
      `update public.health_records set status = 'archived' where id = '${id}';`,
      `select status from public.health_records where id = '${id}';`,
      "active",
      options,
    ),
    "a guardian could not archive the child they guard's record",
  );
});

test("a non-guardian adult cannot see or manage a child's record", () => {
  const id = psql(`select id from public.health_records where member_id = '${childMember}';`, options);
  assert.equal(
    asProfile(PARTNER, `select id from public.health_records where id = '${id}';`, options),
    "",
    "a non-guardian adult could read a child's record",
  );
});

test("selected_family visibility on a record requires the same consent grant health_profiles uses", () => {
  const id = createRecord(PARTNER, partnerMember, "selected_family");
  assert.equal(
    asProfile(HEAD, `select id from public.health_records where id = '${id}';`, options),
    "",
    "selected_family was visible with no consent granted",
  );

  asProfile(
    PARTNER,
    `insert into public.health_consents (household_id, subject_member_id, viewer_member_id, granted_by_member_id)
     values ('${household}', '${partnerMember}', '${headMember}', '${partnerMember}');`,
    options,
  );
  assert.equal(asProfile(HEAD, `select id from public.health_records where id = '${id}';`, options), id);
});

test("the record_type constraint refuses a value outside the known set", () => {
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.health_records (household_id, member_id, label, record_type, created_by_member_id)
       values ('${household}', '${partnerMember}', 'Bad type', 'not_a_real_type', '${partnerMember}');`,
      options,
    ),
    "a record with an unknown record_type was accepted",
  );
});

test("a HomeSend item classified as a health_document is visible only to its own sender, not the whole household", () => {
  const itemId = asProfile(
    PARTNER,
    `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text, classified_kind, status)
     values ('${household}', '${partnerMember}', 'pasted_text', 'Blood test results for Priya', 'health_document', 'classified')
     returning id;`,
    options,
  );
  assert.equal(asProfile(PARTNER, `select id from public.home_send_items where id = '${itemId}';`, options), itemId, "the sender could not see their own item");
  assert.equal(
    asProfile(HEAD, `select count(*) from public.home_send_items where id = '${itemId}';`, options),
    "0",
    "another household member could see an unconfirmed health_document item",
  );
});

test("every other HomeSend kind stays visible to the whole household", () => {
  const itemId = asProfile(
    PARTNER,
    `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text, classified_kind, status)
     values ('${household}', '${partnerMember}', 'pasted_text', 'Electricity bill', 'bill', 'classified')
     returning id;`,
    options,
  );
  assert.equal(asProfile(HEAD, `select id from public.home_send_items where id = '${itemId}';`, options), itemId, "a bill item was not visible to the rest of the household");
});
