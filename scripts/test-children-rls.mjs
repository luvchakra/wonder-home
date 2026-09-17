#!/usr/bin/env node
/**
 * Child profile authorization tests (story 01-004).
 *
 * The story's two hard requirements are that a child can be represented without
 * becoming an account holder, and that age-based access is re-evaluated rather
 * than frozen. The first is asserted here; the second holds because no age band
 * is stored at all — see packages/core/src/identity/age.ts and its tests.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_children_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let adultMember = "";
let outsiderHousehold = "";
let outsiderMember = "";
let childMember = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'),
       ('${ADULT}', 'priya@example.test'),
       ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");

  psql(
    `insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya');`,
    options,
  );
  adultMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(
    `insert into public.household_roles (household_id, member_id, role)
     values ('${household}', '${adultMember}', 'adult');`,
    options,
  );

  [outsiderHousehold, outsiderMember] = asProfile(
    OUTSIDER,
    `select household_id || ' ' || member_id from wh.create_household('Outsider Home', 'Outsider');`,
    options,
  ).split(" ");
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("an administrator can add a child with guardians", () => {
  childMember = asProfile(
    HEAD,
    `select wh.create_child_member('${household}', 'Anaya', '2016-09-18',
       array['${headMember}', '${adultMember}']::uuid[]);`,
    options,
  );
  assert.match(childMember, /^[0-9a-f-]{36}$/);

  assert.equal(
    psql(
      `select count(*) from public.member_guardians where child_member_id = '${childMember}';`,
      options,
    ),
    "2",
  );
});

test("the child needs no account of their own", () => {
  const row = psql(
    `select coalesce(profile_id::text, 'none') || ' ' || member_type
     from public.household_members where id = '${childMember}';`,
    options,
  );
  assert.equal(row, "none child");
});

test("the child's date of birth is stored so age can be derived, never a band", () => {
  const columns = psql(
    `select count(*) from information_schema.columns
     where table_name = 'household_members' and column_name in ('age_band', 'age');`,
    options,
  );
  assert.equal(columns, "0", "an age band column exists; age must be derived, not stored");

  assert.equal(
    psql(`select date_of_birth from public.household_members where id = '${childMember}';`, options),
    "2016-09-18",
  );
});

test("the child holds the child role and nothing more", () => {
  assert.equal(
    psql(
      `select coalesce(string_agg(role, ','), '') from public.household_roles
       where member_id = '${childMember}';`,
      options,
    ),
    "child",
  );
});

test("an ordinary adult cannot add a child", () => {
  assert.ok(
    deniedForProfile(
      ADULT,
      `select wh.create_child_member('${household}', 'Sneaky', null, null);`,
      options,
    ),
    "a non-administrator created a child",
  );
});

test("someone outside the household cannot add a child to it", () => {
  assert.ok(
    deniedForProfile(
      OUTSIDER,
      `select wh.create_child_member('${household}', 'Intruder', null, null);`,
      options,
    ),
    "an outsider created a child in another household",
  );
});

test("a guardian from another household cannot be linked", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.member_guardians (household_id, child_member_id, guardian_member_id)
       values ('${household}', '${childMember}', '${outsiderMember}');`,
      options,
    ),
    "a cross-household guardian link was accepted",
  );
});

test("a child cannot be their own guardian", () => {
  let rejected = false;
  try {
    psql(
      `insert into public.member_guardians (household_id, child_member_id, guardian_member_id)
       values ('${household}', '${childMember}', '${childMember}');`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "a child was recorded as their own guardian");
});

test("guardianship in another household is not readable", () => {
  assert.equal(
    asProfile(
      OUTSIDER,
      `select count(*) from public.member_guardians where household_id = '${household}';`,
      options,
    ),
    "0",
  );
  assert.notEqual(outsiderHousehold, household);
});

test("adding a child is audited", () => {
  assert.ok(
    Number(
      asProfile(
        HEAD,
        `select count(*) from public.audit_events
         where household_id = '${household}' and event_type = 'child.created';`,
        options,
      ),
    ) >= 1,
  );
});
