#!/usr/bin/env node
/**
 * Platform administration boundary tests (stories 16-001, 16-002, 16-004).
 *
 * The property under test is separation: household authority and platform
 * authority are different systems that do not compose. A Head of Family is not
 * staff, and staff are not members of anybody's household.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_platform_admin_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const STAFF = "22222222-2222-4222-8222-222222222222";
const OTHER_STAFF = "33333333-3333-4333-8333-333333333333";

let household = "";

function grant({ profile = STAFF, expiresIn = "2 hours", reason = "user_reported_issue" } = {}) {
  return psql(
    `insert into public.support_access_grants
       (household_id, admin_profile_id, reason_code, reason_note, expires_at)
     values ('${household}', '${profile}', '${reason}',
             'Household reported that routines stopped running', now() + interval '${expiresIn}')
     returning id;`,
    options,
  );
}

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'),
       ('${STAFF}', 'staff@wonderhome.test'),
       ('${OTHER_STAFF}', 'other@wonderhome.test');`,
    options,
  );

  [household] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");

  psql(
    `insert into public.profiles (id, display_name) values
       ('${STAFF}', 'Support Staff'), ('${OTHER_STAFF}', 'Other Staff');
     insert into public.platform_admins (profile_id, role) values
       ('${STAFF}', 'support'), ('${OTHER_STAFF}', 'operator');`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("being Head of Family grants no platform authority", () => {
  assert.equal(asProfile(HEAD, `select wh.is_platform_admin();`, options), "f");
});

test("being platform staff grants no household membership", () => {
  assert.equal(asProfile(STAFF, `select wh.is_member('${household}');`, options), "f");
  assert.equal(asProfile(STAFF, `select wh.is_household_admin('${household}');`, options), "f");
});

test("platform staff still cannot read household data without a grant", () => {
  assert.equal(
    asProfile(STAFF, `select count(*) from public.household_members;`, options),
    "0",
    "staff read household members with no grant",
  );
});

test("a support grant does not silently widen household RLS", () => {
  grant();

  // The grant exists and the helper agrees, but no household policy consults it:
  // support access is applied in the application layer, where it is auditable,
  // rather than as a backdoor threaded through every tenant policy.
  assert.equal(asProfile(STAFF, `select wh.has_support_access('${household}');`, options), "t");
  assert.equal(
    asProfile(STAFF, `select count(*) from public.household_members;`, options),
    "0",
    "a support grant widened RLS on household data",
  );
});

test("the household can see who was granted access to it, and why", () => {
  const rows = asProfile(
    HEAD,
    `select reason_code from public.support_access_grants where household_id = '${household}';`,
    options,
  );
  assert.ok(rows.includes("user_reported_issue"), rows);
});

test("an expired grant no longer counts as access", () => {
  // The schema refuses a grant that expires before it starts, so expiry is
  // reached by ageing a valid grant rather than by creating an invalid one.
  const id = grant({ profile: OTHER_STAFF });
  psql(
    `update public.support_access_grants
     set granted_at = now() - interval '3 hours', expires_at = now() - interval '1 hour'
     where id = '${id}';`,
    options,
  );

  assert.equal(asProfile(OTHER_STAFF, `select wh.has_support_access('${household}');`, options), "f");
});

test("a revoked grant no longer counts as access", () => {
  psql(
    `update public.support_access_grants set revoked_at = now()
     where household_id = '${household}' and admin_profile_id = '${STAFF}';`,
    options,
  );
  assert.equal(asProfile(STAFF, `select wh.has_support_access('${household}');`, options), "f");
});

test("suspending a staff member ends their access immediately", () => {
  psql(
    `update public.support_access_grants set revoked_at = null, expires_at = now() + interval '2 hours'
     where household_id = '${household}' and admin_profile_id = '${STAFF}';`,
    options,
  );
  assert.equal(asProfile(STAFF, `select wh.has_support_access('${household}');`, options), "t");

  psql(`update public.platform_admins set status = 'suspended' where profile_id = '${STAFF}';`, options);

  assert.equal(asProfile(STAFF, `select wh.is_platform_admin();`, options), "f");
  assert.equal(asProfile(STAFF, `select wh.has_support_access('${household}');`, options), "f");
});

test("a grant must be time-boxed and carry a real reason", () => {
  let rejectedUnbounded = false;
  try {
    psql(
      `insert into public.support_access_grants
         (household_id, admin_profile_id, reason_code, reason_note, granted_at, expires_at)
       values ('${household}', '${OTHER_STAFF}', 'data_correction', 'A sufficiently long reason note',
               now(), now() - interval '1 minute');`,
      options,
    );
  } catch {
    rejectedUnbounded = true;
  }
  assert.ok(rejectedUnbounded, "a grant that expires before it starts was accepted");

  let rejectedThinReason = false;
  try {
    psql(
      `insert into public.support_access_grants
         (household_id, admin_profile_id, reason_code, reason_note, expires_at)
       values ('${household}', '${OTHER_STAFF}', 'data_correction', 'why', now() + interval '1 hour');`,
      options,
    );
  } catch {
    rejectedThinReason = true;
  }
  assert.ok(rejectedThinReason, "a one-word reason was accepted");
});

test("staff cannot be provisioned from a browser session", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.platform_admins (profile_id, role) values ('${HEAD}', 'owner');`,
      options,
    ),
    "a household member made themselves platform staff",
  );
});

test("a household member cannot see the staff roster", () => {
  assert.equal(asProfile(HEAD, `select count(*) from public.platform_admins;`, options), "0");
});
