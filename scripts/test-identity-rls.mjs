#!/usr/bin/env node
/**
 * Identity and household authorization tests (stories 01-001, 01-003, 15-002).
 *
 * These run against a real database built from the committed migrations, as the
 * `authenticated` role with real JWT claims, so they exercise the shipping RLS
 * policies rather than a model of them. Cross-household access and the
 * ownership invariants are the things most expensive to get wrong, so they are
 * asserted directly rather than inferred from code review.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForAnonymous, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_identity_test";
const options = { database: DB };

const KUNAL = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const PARTNER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let otherHousehold = "";
let otherMember = "";
let partnerMember = "";

before(() => {
  buildTestDatabase(DB);

  psql(
    `insert into auth.users (id, email) values
       ('${KUNAL}', 'kunal@example.test'),
       ('${STRANGER}', 'stranger@example.test'),
       ('${PARTNER}', 'priya@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    KUNAL,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");

  [otherHousehold, otherMember] = asProfile(
    STRANGER,
    `select household_id || ' ' || member_id from wh.create_household('Someone Else Home', 'Stranger');`,
    options,
  ).split(" ");

  psql(`insert into public.profiles (id, display_name) values ('${PARTNER}', 'Priya');`, options);
  partnerMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${PARTNER}', 'adult', 'Priya') returning id;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("the creator becomes Head of Family of the household they created", () => {
  const role = asProfile(
    KUNAL,
    `select r.role from public.household_roles r
     join public.household_members m on m.id = r.member_id
     where r.household_id = '${household}' and m.profile_id = '${KUNAL}';`,
    options,
  );
  assert.equal(role, "head");
});

test("ownership is one row that points at the head member", () => {
  const owner = psql(
    `select owner_member_id from public.households where id = '${household}';`,
    options,
  );
  assert.equal(owner, headMember);
});

test("a second head cannot be created for the same household", () => {
  assert.ok(
    deniedForProfile(
      KUNAL,
      `insert into public.household_roles (household_id, member_id, role)
       values ('${household}', '${headMember}', 'head');`,
      options,
    ),
    "a second head role was accepted",
  );
});

test("a household cannot have its owner removed", () => {
  let rejected = false;
  try {
    psql(`update public.households set owner_member_id = null where id = '${household}';`, options);
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "owner_member_id was allowed to become null");
});

test("a role grant cannot reference a member of another household", () => {
  assert.ok(
    deniedForProfile(
      KUNAL,
      `insert into public.household_roles (household_id, member_id, role)
       values ('${household}', '${otherMember}', 'adult');`,
      options,
    ),
    "a cross-household role grant was accepted",
  );
});

test("a member sees only their own household", () => {
  const ids = asProfile(KUNAL, `select id from public.households order by id;`, options)
    .split("\n")
    .filter(Boolean);
  assert.deepEqual(ids, [household]);
});

test("querying by profile_id resolves each account to its own membership row, not a housemate's", () => {
  // The exact query listMemberships() runs (story 01-001 regression): RLS
  // correctly lets any household member read every row of their household
  // for the family list, so an unfiltered query returns everyone in it. The
  // application layer has to narrow that to "the row that is me" itself —
  // this is what filtering by profile_id does, and what its absence broke:
  // a signed-in adult's session could resolve to a housemate's membership
  // row, showing them a child's personalized view instead of their own.
  const kunalRow = asProfile(
    KUNAL,
    `select id from public.household_members
     where status = 'active' and profile_id = '${KUNAL}';`,
    options,
  );
  assert.equal(kunalRow, headMember, "Kunal's own-profile query returned someone else's membership");

  const partnerRow = asProfile(
    PARTNER,
    `select id from public.household_members
     where status = 'active' and profile_id = '${PARTNER}';`,
    options,
  );
  assert.equal(partnerRow, partnerMember, "Priya's own-profile query returned someone else's membership");

  // The scenario that actually happened: the household seen without the
  // filter has two rows, and either could sort first.
  const wholeHousehold = asProfile(
    KUNAL,
    `select count(*) from public.household_members where household_id = '${household}' and status = 'active';`,
    options,
  );
  assert.equal(wholeHousehold, "2", "expected two members sharing the household in this scenario");
});

test("a member cannot read another household's members", () => {
  const rows = asProfile(
    KUNAL,
    `select count(*) from public.household_members where household_id = '${otherHousehold}';`,
    options,
  );
  assert.equal(rows, "0");
});

test("a member cannot insert themselves into another household", () => {
  assert.ok(
    deniedForProfile(
      KUNAL,
      `insert into public.household_members (household_id, profile_id, member_type, display_name)
       values ('${otherHousehold}', '${KUNAL}', 'adult', 'Intruder');`,
      options,
    ),
    "a member was able to join another household",
  );
});

test("a household cannot be created by inserting a row directly", () => {
  assert.ok(
    deniedForProfile(
      KUNAL,
      `insert into public.households (name) values ('Bypass Home');`,
      options,
    ),
    "a household was created without going through wh.create_household",
  );
});

test("creating a household is audited", () => {
  const events = asProfile(
    KUNAL,
    `select event_type from public.audit_events where household_id = '${household}';`,
    options,
  );
  assert.equal(events, "household.created");
});

test("an admin can set a member's extended profile details", () => {
  asProfile(
    KUNAL,
    `update public.household_members
     set nickname = 'KC', relationship = 'Father', occupation = 'Engineer',
         school_or_work_location = 'WonderHome Inc.',
         special_occasion_label = 'Wedding anniversary', special_occasion_date = '2010-02-14'
     where id = '${headMember}';`,
    options,
  );

  assert.equal(
    psql(
      `select nickname || '|' || relationship || '|' || occupation from public.household_members where id = '${headMember}';`,
      options,
    ),
    "KC|Father|Engineer",
  );
});

test("someone outside the household cannot edit a member's profile details", () => {
  // STRANGER is still only otherHousehold's own head here — the next test
  // ("an administrator cannot promote themselves to head") is what first
  // makes STRANGER a legitimate administrator of `household`, so this one
  // has to run before it or the assertion below would no longer be true
  // (see the shared-database gotcha documented in scripts/lib/db.mjs).
  assert.ok(
    deniedForUpdate(
      STRANGER,
      `update public.household_members set nickname = 'Planted' where id = '${headMember}';`,
      `select nickname from public.household_members where id = '${headMember}';`,
      "KC",
      options,
    ),
    "an outsider could edit another household's member details",
  );
});

test("an administrator cannot promote themselves to head", () => {
  // Kunal adds an adult member and makes them an administrator.
  const adminMember = asProfile(
    KUNAL,
    `insert into public.household_members (household_id, member_type, display_name)
     values ('${household}', 'adult', 'Priya') returning id;`,
    options,
  );

  psql(
    `update public.household_members set profile_id = '${STRANGER}' where id = '${adminMember}';
     insert into public.household_roles (household_id, member_id, role)
     values ('${household}', '${adminMember}', 'administrator');`,
    options,
  );

  assert.ok(
    deniedForProfile(
      STRANGER,
      `insert into public.household_roles (household_id, member_id, role)
       values ('${household}', '${adminMember}', 'head');`,
      options,
    ),
    "an administrator was able to grant themselves the head role",
  );
});

test("a member can edit their own profile details", () => {
  asProfile(
    PARTNER,
    `update public.household_members set nickname = 'Pri', occupation = 'Architect' where id = '${partnerMember}';`,
    options,
  );
  assert.equal(
    psql(`select nickname || ' ' || occupation from public.household_members where id = '${partnerMember}';`, options),
    "Pri Architect",
  );
});

test("a member editing themselves cannot change their own type, status, household or account link", () => {
  assert.ok(
    deniedForUpdate(
      PARTNER,
      `update public.household_members set member_type = 'child' where id = '${partnerMember}';`,
      `select member_type from public.household_members where id = '${partnerMember}';`,
      "adult",
      options,
    ),
    "a member promoted or demoted their own member_type",
  );
  assert.ok(
    deniedForUpdate(
      PARTNER,
      `update public.household_members set status = 'inactive' where id = '${partnerMember}';`,
      `select status from public.household_members where id = '${partnerMember}';`,
      "active",
      options,
    ),
    "a member changed their own status",
  );
  assert.ok(
    deniedForUpdate(
      PARTNER,
      `update public.household_members set household_id = '${otherHousehold}' where id = '${partnerMember}';`,
      `select household_id from public.household_members where id = '${partnerMember}';`,
      household,
      options,
    ),
    "a member moved themselves to another household",
  );
});

test("a member still cannot edit someone else's profile", () => {
  assert.ok(
    deniedForUpdate(
      PARTNER,
      `update public.household_members set nickname = 'Planted' where id = '${headMember}';`,
      `select nickname from public.household_members where id = '${headMember}';`,
      "KC",
      options,
    ),
    "a non-admin member edited another member's profile",
  );
});

test("an Admin editing their own row is unaffected by the self-edit guard", () => {
  asProfile(
    KUNAL,
    `update public.household_members set nickname = 'K' where id = '${headMember}';`,
    options,
  );
  assert.equal(psql(`select nickname from public.household_members where id = '${headMember}';`, options), "K");
});

test("a signed-out visitor is refused household data outright", () => {
  // anon holds no grant on these tables at all, so the refusal comes before RLS
  // is even consulted — a stronger outcome than an empty result set.
  assert.ok(deniedForAnonymous(`select count(*) from public.households;`, options));
  assert.ok(deniedForAnonymous(`select count(*) from public.household_members;`, options));
});
