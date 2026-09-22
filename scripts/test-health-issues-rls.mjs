#!/usr/bin/env node
/**
 * Health issues: the same self/guardian/household_operational/consented-
 * viewer RLS shape 21-001 and 21-002 already established, proven again for
 * `health_issues` (story 21-003) — never assumed to generalize just because
 * the migration copies the same policy text.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_health_issues_test";
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

function createIssue(profileId, memberId, scope = "private") {
  asProfile(
    profileId,
    `insert into public.health_issues (household_id, member_id, label, privacy_scope, created_by_member_id)
     values ('${household}', '${memberId}', 'Test issue', '${scope}', '${memberId}');`,
    options,
  );
  return psql(`select id from public.health_issues where member_id = '${memberId}' and privacy_scope = '${scope}' order by created_at desc limit 1;`, options);
}

test("a member can create and read their own private issue", () => {
  const id = createIssue(PARTNER, partnerMember);
  assert.equal(asProfile(PARTNER, `select id from public.health_issues where id = '${id}';`, options), id);
});

test("the household administrator cannot read another adult's private issue", () => {
  const id = psql(`select id from public.health_issues where member_id = '${partnerMember}';`, options);
  assert.equal(
    asProfile(HEAD, `select id from public.health_issues where id = '${id}';`, options),
    "",
    "the household administrator could read another adult's private issue",
  );
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_issues where id = '${id}';`, options), "0");
});

test("the household administrator cannot change another adult's private issue's status either", () => {
  const id = psql(`select id from public.health_issues where member_id = '${partnerMember}';`, options);
  assert.ok(
    deniedForUpdate(
      HEAD,
      `update public.health_issues set status = 'active' where id = '${id}';`,
      `select status from public.health_issues where id = '${id}';`,
      "mentioned",
      options,
    ),
    "the household administrator could change another adult's private issue",
  );
});

test("household_operational scope is visible to any member", () => {
  const id = createIssue(PARTNER, partnerMember, "household_operational");
  assert.equal(asProfile(HEAD, `select id from public.health_issues where id = '${id}';`, options), id);
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_issues where id = '${id}';`, options), "0");
});

test("a guardian can see and manage their child's issue regardless of scope", () => {
  const id = createIssue(HEAD, childMember, "private");
  assert.equal(asProfile(HEAD, `select id from public.health_issues where id = '${id}';`, options), id);
  assert.ok(
    !deniedForUpdate(
      HEAD,
      `update public.health_issues set status = 'active' where id = '${id}';`,
      `select status from public.health_issues where id = '${id}';`,
      "mentioned",
      options,
    ),
    "a guardian could not update the child they guard's issue",
  );
});

test("a non-guardian adult cannot see or manage a child's issue", () => {
  const id = psql(`select id from public.health_issues where member_id = '${childMember}';`, options);
  assert.equal(
    asProfile(PARTNER, `select id from public.health_issues where id = '${id}';`, options),
    "",
    "a non-guardian adult could read a child's issue",
  );
});

test("selected_family visibility on an issue requires the same consent grant health_profiles uses", () => {
  const id = createIssue(PARTNER, partnerMember, "selected_family");
  assert.equal(
    asProfile(HEAD, `select id from public.health_issues where id = '${id}';`, options),
    "",
    "selected_family was visible with no consent granted",
  );

  asProfile(
    PARTNER,
    `insert into public.health_consents (household_id, subject_member_id, viewer_member_id, granted_by_member_id)
     values ('${household}', '${partnerMember}', '${headMember}', '${partnerMember}');`,
    options,
  );
  assert.equal(asProfile(HEAD, `select id from public.health_issues where id = '${id}';`, options), id);
});

test("the resolved_at consistency constraint rejects a resolved issue with no resolved_at", () => {
  const id = psql(`select id from public.health_issues where member_id = '${partnerMember}' and privacy_scope = 'household_operational';`, options);
  assert.ok(
    deniedForUpdate(
      HEAD,
      `update public.health_issues set status = 'resolved' where id = '${id}';`,
      `select status from public.health_issues where id = '${id}';`,
      "mentioned",
      options,
    ),
    "the household administrator could still not do this (wrong reason: RLS, not the constraint, since this profile has no write access)",
  );
  // Re-check the constraint itself, as the actual owner, without setting resolved_at.
  let rejected = false;
  try {
    asProfile(
      PARTNER,
      `update public.health_issues set status = 'resolved' where id = '${id}';`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "a resolved issue with no resolved_at was accepted");
});

test("health_provenance rows a health issue links to carry no health content, and are readable household-wide", () => {
  // Mirrors what packages/core/src/health/issues.ts's createIssue() actually
  // does — insert provenance first, with no label/description/notes, then
  // link it — since the raw-SQL createIssue() helper above (needed so these
  // RLS tests don't depend on the app layer) never populates provenance_id.
  const provenanceId = asProfile(
    PARTNER,
    `insert into public.health_provenance (household_id, source_type, confidence, confirmed_by, confirmed_at)
     values ('${household}', 'manual_entry', 1.0, '${partnerMember}', now()) returning id;`,
    options,
  );
  const id = asProfile(
    PARTNER,
    `insert into public.health_issues (household_id, member_id, label, privacy_scope, source_type, provenance_id, created_by_member_id)
     values ('${household}', '${partnerMember}', 'Sensitive label', 'private', 'manual_entry', '${provenanceId}', '${partnerMember}') returning id;`,
    options,
  );

  const row = asProfile(HEAD, `select source_type, confidence from public.health_provenance where id = '${provenanceId}';`, options);
  assert.match(row, /manual_entry/, "the household administrator could not read the household-wide-visible provenance row");
  assert.doesNotMatch(row, /Sensitive label/);

  assert.equal(
    asProfile(HEAD, `select id from public.health_issues where id = '${id}';`, options),
    "",
    "the household administrator could read another adult's private issue via its provenance-linked row",
  );
});
