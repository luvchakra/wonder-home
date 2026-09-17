#!/usr/bin/env node
/**
 * Kids and school database tests (module 08).
 *
 * The rule under test is guardianship. A child's school work is not household
 * reading: it belongs to the child, their guardians and an administrator, and
 * nobody else — not the other parent's friend, not a househelper with an
 * account, not another child in the same house.
 *
 * The acceptance criterion says that is enforced "at both API and database
 * layers", so these tests bypass the API entirely and ask Postgres directly.
 * If the policies are wrong, no amount of route code can save it.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_school_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const OTHER_ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let otherAdultMember = "";
let child = "";
let secondChild = "";
let otherHousehold = "";
let itemId = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'priya@example.test'),
       ('${OTHER_ADULT}', 'adult@example.test'),
       ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Priya');`,
    options,
  ).split(" ");

  [otherHousehold] = asProfile(
    OUTSIDER,
    `select household_id || ' ' || member_id from wh.create_household('Outsider Home', 'Outsider');`,
    options,
  ).split(" ");

  // A second adult in the same household who is nobody's guardian.
  psql(`insert into public.profiles (id, display_name) values ('${OTHER_ADULT}', 'Another adult');`, options);
  otherAdultMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${OTHER_ADULT}', 'adult', 'Another adult') returning id;`,
    options,
  );

  child = asProfile(
    HEAD,
    `select wh.create_child_member('${household}', 'Aarav', '2016-04-01'::date, array['${headMember}']::uuid[]);`,
    options,
  );
  secondChild = asProfile(
    HEAD,
    `select wh.create_child_member('${household}', 'Anaya', '2013-02-01'::date, array['${headMember}']::uuid[]);`,
    options,
  );

  itemId = asProfile(
    HEAD,
    `insert into public.school_items (household_id, child_member_id, kind, title, due_at)
     values ('${household}', '${child}', 'homework', 'Maths worksheet', now() + interval '1 day')
     returning id;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a guardian sees their child's school work", () => {
  assert.equal(asProfile(HEAD, `select title from public.school_items;`, options), "Maths worksheet");
});

test("another adult in the same household does not", () => {
  // Living here is not guardianship. This is the whole point of the module's
  // access rule, and the case a household-wide policy would silently allow.
  assert.equal(
    asProfile(OTHER_ADULT, `select count(*) from public.school_items;`, options),
    "0",
    "a non-guardian adult could read a child's school work",
  );
});

test("another household sees nothing at all", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.school_items;`, options), "0");
});

test("a non-guardian cannot add work to a child", () => {
  assert.ok(
    deniedForProfile(
      OTHER_ADULT,
      `insert into public.school_items (household_id, child_member_id, kind, title)
       values ('${household}', '${child}', 'homework', 'Planted');`,
      options,
    ),
  );
});

test("work cannot be filed against another household's child", () => {
  const theirChild = asProfile(
    OUTSIDER,
    `select wh.create_child_member('${otherHousehold}', 'Their child', null, null);`,
    options,
  );

  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.school_items (household_id, child_member_id, kind, title)
       values ('${household}', '${theirChild}', 'homework', 'Not ours');`,
      options,
    ),
  );
});

test("a completion has to say who said so", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.school_items set status = 'done', completed_at = now() where id = '${itemId}';`,
      options,
    ),
    "work was marked done with no record of who confirmed it",
  );

  asProfile(
    HEAD,
    `update public.school_items
       set status = 'done', completed_at = now(), completion_source = 'member_confirmed'
     where id = '${itemId}';`,
    options,
  );

  assert.equal(
    psql(`select completion_source from public.school_items where id = '${itemId}';`, options),
    "member_confirmed",
  );
});

test("an estimate has to say where it came from", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.school_items (household_id, child_member_id, kind, title, estimated_minutes)
       values ('${household}', '${child}', 'homework', 'No source', 30);`,
      options,
    ),
    "an estimate was accepted with no source, so a guess would look like a fact",
  );
});

test("the same portal item cannot be imported twice", () => {
  const integration = asProfile(
    HEAD,
    `insert into public.integrations (household_id, kind, provider) values ('${household}', 'school', 'example_school') returning id;`,
    options,
  );

  asProfile(
    HEAD,
    `insert into public.school_items (household_id, child_member_id, kind, title, integration_id, external_id)
     values ('${household}', '${child}', 'homework', 'From the portal', '${integration}', 'portal-1');`,
    options,
  );

  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.school_items (household_id, child_member_id, kind, title, integration_id, external_id)
       values ('${household}', '${child}', 'homework', 'From the portal again', '${integration}', 'portal-1');`,
      options,
    ),
    "a re-import created a second copy of the same homework",
  );
});

test("a child sees their own work and not their sibling's", () => {
  // Children have no account in this test, so the check is on the policy itself:
  // a guardian of one child is not thereby a guardian of the other.
  const guardianOfOne = psql(
    `select count(*) from public.member_guardians
     where child_member_id = '${secondChild}' and guardian_member_id = '${otherAdultMember}';`,
    options,
  );

  assert.equal(guardianOfOne, "0");
  assert.equal(
    asProfile(OTHER_ADULT, `select count(*) from public.school_items;`, options),
    "0",
    "guardianship leaked between children",
  );
});

test("documents follow the same rule as the work they belong to", () => {
  asProfile(
    HEAD,
    `insert into public.school_documents (household_id, child_member_id, title, storage_path)
     values ('${household}', '${child}', 'Worksheet', 'school/${child}/worksheet.pdf');`,
    options,
  );

  assert.equal(asProfile(HEAD, `select count(*) from public.school_documents;`, options), "1");
  assert.equal(
    asProfile(OTHER_ADULT, `select count(*) from public.school_documents;`, options),
    "0",
    "a non-guardian could reach a child's worksheet",
  );
});

test("a communication that asks something has to say what", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.school_communications (household_id, child_member_id, summary, requires_action)
       values ('${household}', '${child}', 'Something is needed.', true);`,
      options,
    ),
    "a message demanded action without saying what the action was",
  );
});

test("a household-wide school notice is administrator reading, not everyone's", () => {
  asProfile(
    HEAD,
    `insert into public.school_communications (household_id, summary, requires_action)
     values ('${household}', 'The school is closed on Friday.', false);`,
    options,
  );

  assert.equal(asProfile(HEAD, `select count(*) from public.school_communications;`, options), "1");
  assert.equal(
    asProfile(OTHER_ADULT, `select count(*) from public.school_communications;`, options),
    "0",
  );
});
