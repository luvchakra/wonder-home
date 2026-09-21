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

import { asProfile, deniedForAnonymous, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_identity_test";
const options = { database: DB };

const KUNAL = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";

let household = "";
let headMember = "";
let otherHousehold = "";
let otherMember = "";

before(() => {
  buildTestDatabase(DB);

  psql(
    `insert into auth.users (id, email) values
       ('${KUNAL}', 'kunal@example.test'),
       ('${STRANGER}', 'stranger@example.test');`,
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
  // has to run before it or the assertion below would no longer be true.
  //
  // Not a policy violation an insert/select would raise on — an UPDATE with
  // no matching row-level policy simply touches zero rows, so this is
  // asserted by checking nothing changed rather than expecting a thrown error.
  asProfile(STRANGER, `update public.household_members set nickname = 'Planted' where id = '${headMember}';`, options);

  assert.equal(
    psql(`select nickname from public.household_members where id = '${headMember}';`, options),
    "KC",
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

test("a signed-out visitor is refused household data outright", () => {
  // anon holds no grant on these tables at all, so the refusal comes before RLS
  // is even consulted — a stronger outcome than an empty result set.
  assert.ok(deniedForAnonymous(`select count(*) from public.households;`, options));
  assert.ok(deniedForAnonymous(`select count(*) from public.household_members;`, options));
});
