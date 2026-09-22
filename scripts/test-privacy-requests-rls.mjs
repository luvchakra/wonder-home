#!/usr/bin/env node
/**
 * Privacy request visibility and the platform-admin boundary (stories
 * 15-007, 16-007).
 *
 * `privacy_requests` has carried its RLS policies since 15-007 with no test
 * file of its own exercising them against real Postgres — this closes that
 * gap. It also proves the property 16-007's platform-admin routes depend on:
 * no signed-in session, however privileged within its own household, can
 * read another household's requests or write a refusal/completion — only
 * the service-role client (`requirePlatformAdmin` + `createAdminClient()`)
 * reaches this table from the platform side, exactly because no RLS policy
 * grants it that reach.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_privacy_requests_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const EXTRA_A = "44444444-4444-4444-8444-444444444444";
const EXTRA_B = "55555555-5555-4555-8555-555555555555";

let household = "";
let headMember = "";
let partnerMember = "";
// Two more, self-request-capable members — one per test that needs to
// create its own live (pending/ready) deletion request without colliding
// with another test's row for the same subject under
// `privacy_requests_one_live_per_subject` (this file's one shared database,
// per `lib/db.mjs`'s gotcha #2).
let extraMemberA = "";
let extraMemberB = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'), ('${PARTNER}', 'priya@example.test'),
       ('${OUTSIDER}', 'outsider@example.test'), ('${EXTRA_A}', 'kavya@example.test'), ('${EXTRA_B}', 'rahul@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");

  psql(
    `insert into public.profiles (id, display_name) values
       ('${PARTNER}', 'Priya'), ('${OUTSIDER}', 'Outsider'), ('${EXTRA_A}', 'Kavya'), ('${EXTRA_B}', 'Rahul');`,
    options,
  );
  partnerMember = addAdultMember(PARTNER, "Priya");
  extraMemberA = addAdultMember(EXTRA_A, "Kavya");
  extraMemberB = addAdultMember(EXTRA_B, "Rahul");

  // A second household, unrelated, so cross-tenant leakage has something real to leak.
  asProfile(OUTSIDER, `select wh.create_household('Outsider Home', 'Outsider');`, options);
});

function addAdultMember(profileId, name) {
  const memberId = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${profileId}', 'adult', '${name}') returning id;`,
    options,
  );
  psql(
    `insert into public.household_roles (household_id, member_id, role) values ('${household}', '${memberId}', 'adult');`,
    options,
  );
  return memberId;
}

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a member can request their own export and read it back", () => {
  const id = asProfile(
    PARTNER,
    `insert into public.privacy_requests (household_id, requested_by_member_id, subject_member_id, kind, status, completed_at)
     values ('${household}', '${partnerMember}', '${partnerMember}', 'export', 'completed', now())
     returning id;`,
    options,
  );
  assert.equal(
    asProfile(PARTNER, `select id from public.privacy_requests where id = '${id}';`, options),
    id,
  );
});

test("an export request is nobody's business but the person who asked", () => {
  const id = asProfile(
    PARTNER,
    `insert into public.privacy_requests (household_id, requested_by_member_id, subject_member_id, kind, status, completed_at)
     values ('${household}', '${partnerMember}', '${partnerMember}', 'export', 'completed', now())
     returning id;`,
    options,
  );
  // The household's owner is an administrator, but this is an export, not a deletion.
  assert.equal(
    asProfile(HEAD, `select count(*) from public.privacy_requests where id = '${id}';`, options),
    "0",
  );
});

test("a household administrator can see a deletion request in their own household, but nobody outside it can", () => {
  const id = asProfile(
    PARTNER,
    `insert into public.privacy_requests (household_id, requested_by_member_id, subject_member_id, kind, status, acts_at)
     values ('${household}', '${partnerMember}', '${partnerMember}', 'deletion', 'pending', now() + interval '30 days')
     returning id;`,
    options,
  );
  assert.equal(
    asProfile(HEAD, `select id from public.privacy_requests where id = '${id}';`, options),
    id,
  );
  assert.equal(
    asProfile(OUTSIDER, `select count(*) from public.privacy_requests where id = '${id}';`, options),
    "0",
  );
});

test("at most one live deletion request per subject", () => {
  asProfile(
    EXTRA_A,
    `insert into public.privacy_requests (household_id, requested_by_member_id, subject_member_id, kind, status, acts_at)
     values ('${household}', '${extraMemberA}', '${extraMemberA}', 'deletion', 'pending', now() + interval '30 days');`,
    options,
  );
  let threw = false;
  try {
    asProfile(
      EXTRA_A,
      `insert into public.privacy_requests (household_id, requested_by_member_id, subject_member_id, kind, status, acts_at)
       values ('${household}', '${extraMemberA}', '${extraMemberA}', 'deletion', 'pending', now() + interval '30 days');`,
      options,
    );
  } catch {
    threw = true;
  }
  assert.ok(threw, "a second live deletion request was accepted for the same subject");
});

test("a refused request no longer blocks a new one — refused is not a live status", () => {
  const id = asProfile(
    HEAD,
    `insert into public.privacy_requests (household_id, requested_by_member_id, subject_member_id, kind, status, acts_at)
     values ('${household}', '${headMember}', '${headMember}', 'deletion', 'pending', now() + interval '30 days')
     returning id;`,
    options,
  );
  psql(`update public.privacy_requests set status = 'refused', refusal_reason = 'Under review' where id = '${id}';`, options);

  const secondId = asProfile(
    HEAD,
    `insert into public.privacy_requests (household_id, requested_by_member_id, subject_member_id, kind, status, acts_at)
     values ('${household}', '${headMember}', '${headMember}', 'deletion', 'pending', now() + interval '30 days')
     returning id;`,
    options,
  );
  assert.notEqual(secondId, id);
});

test("no signed-in session, however privileged, can refuse or complete a request directly — only the admin client can", () => {
  const id = asProfile(
    EXTRA_B,
    `insert into public.privacy_requests (household_id, requested_by_member_id, subject_member_id, kind, status, acts_at)
     values ('${household}', '${extraMemberB}', '${extraMemberB}', 'deletion', 'pending', now() + interval '30 days')
     returning id;`,
    options,
  );

  // The household's own administrator cannot write a refusal — RLS's update
  // policy only ever matches the subject themselves, and only for their own
  // row, never a "because I'm an admin" path. This is what makes the
  // platform-admin route's service-role client necessary rather than a
  // shortcut.
  assert.equal(
    asProfile(
      HEAD,
      `update public.privacy_requests set status = 'refused', refusal_reason = 'Should not be reachable this way'
       where id = '${id}' returning id;`,
      options,
    ),
    "",
  );

  // The service-role connection (what `createAdminClient()` uses) can, because
  // it bypasses RLS entirely — the same reach every other platform-admin
  // capability in this schema depends on.
  psql(`update public.privacy_requests set status = 'refused', refusal_reason = 'Admin action' where id = '${id}';`, options);
  assert.equal(psql(`select status from public.privacy_requests where id = '${id}';`, options), "refused");
});

test("household_members carries every field a deletion fulfillment scrubs", () => {
  const columns = psql(
    `select string_agg(column_name, ',') from information_schema.columns
     where table_schema = 'public' and table_name = 'household_members';`,
    options,
  );
  for (const column of [
    "display_name",
    "date_of_birth",
    "nickname",
    "relationship",
    "occupation",
    "school_or_work_location",
    "special_occasion_label",
    "special_occasion_date",
    "avatar_path",
    "profile_id",
    "status",
  ]) {
    assert.ok(columns.includes(column), `household_members is missing ${column}`);
  }
});
