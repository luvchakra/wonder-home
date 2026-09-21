#!/usr/bin/env node
/**
 * Certification database tests (module 05, story 05-007).
 *
 * Two different privacy rules sit side by side here, and the point of this
 * file is to keep them distinguishable rather than let one drift into the
 * other by accident.
 *
 * `certification_items` is scoped: a household-wide belief is everyone's to
 * read, but a member-scoped one belongs to that member and to an admin —
 * the same split `school_items` and `finance` already enforce for anyone
 * with a personal record in a shared home.
 *
 * `certification_reviews` — the append-only "who changed what, and when"
 * trail story 05-007 surfaces — is deliberately household-wide instead
 * (see the migration's own comment): a family can see who corrected what
 * WonderHome believes, even about another member, because that is the
 * accountability the story exists to give them. Both directions are worth
 * a real test, not just the item table's, or a future change to either
 * policy would look identical from the other's tests and pass anyway.
 *
 * Neither table has an insert policy: reviews are recorded by the admin
 * client behind `reviewCertificationAction` so the reviewer is whoever the
 * session actually authenticated, never whatever a request claims.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_certification_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const SUBJECT = "22222222-2222-4222-8222-222222222222";
const BYSTANDER = "44444444-4444-4444-8444-444444444444";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let subjectMember = "";
let householdItem = "";
let memberItem = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'),
       ('${SUBJECT}', 'priya@example.test'),
       ('${BYSTANDER}', 'rekha@example.test'),
       ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");

  // Two more adults in the same household, neither of them admins: one is
  // the subject of the private belief below, the other has no connection
  // to it at all beyond living in the same home.
  psql(
    `insert into public.profiles (id, display_name) values
       ('${SUBJECT}', 'Priya'), ('${BYSTANDER}', 'Rekha');`,
    options,
  );
  subjectMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${SUBJECT}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${BYSTANDER}', 'adult', 'Rekha');`,
    options,
  );

  asProfile(OUTSIDER, `select household_id from wh.create_household('Outsider Home', 'Outsider');`, options);

  householdItem = psql(
    `insert into public.certification_items (household_id, category, claim, scope, source_type, status, risk_level)
     values ('${household}', 'home_routines', 'Bins go out Tuesday', 'household', 'setup', 'confirmed', 'low')
     returning id;`,
    options,
  );
  memberItem = psql(
    `insert into public.certification_items (household_id, category, claim, scope, member_id, source_type, status, risk_level)
     values ('${household}', 'finance', 'Prefers a personal spending alert at ₹5,000', 'member', '${subjectMember}', 'conversation', 'confirmed', 'low')
     returning id;`,
    options,
  );

  psql(
    `insert into public.certification_reviews (household_id, item_id, reviewer_member_id, decision, previous_value, new_value)
     values ('${household}', '${memberItem}', '${subjectMember}', 'confirmed',
             '{"claim": "Prefers a personal spending alert", "status": "learned"}'::jsonb,
             '{"claim": "Prefers a personal spending alert at ₹5,000", "status": "confirmed"}'::jsonb);`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a household-wide belief is visible to any member", () => {
  assert.equal(
    asProfile(HEAD, `select count(*) from public.certification_items where id = '${householdItem}';`, options),
    "1",
  );
  assert.equal(
    asProfile(BYSTANDER, `select count(*) from public.certification_items where id = '${householdItem}';`, options),
    "1",
  );
});

test("a member-scoped belief is not another adult's to read", () => {
  // Living in the same house is not the same as being the belief's subject
  // or an admin — the whole reason certification_items carries a scope
  // column at all.
  assert.equal(
    asProfile(BYSTANDER, `select count(*) from public.certification_items where id = '${memberItem}';`, options),
    "0",
    "a bystander adult could read another member's private belief",
  );
});

test("the subject sees their own member-scoped belief", () => {
  assert.equal(
    asProfile(SUBJECT, `select claim from public.certification_items where id = '${memberItem}';`, options),
    "Prefers a personal spending alert at ₹5,000",
  );
});

test("an admin sees a member-scoped belief too", () => {
  assert.equal(
    asProfile(HEAD, `select count(*) from public.certification_items where id = '${memberItem}';`, options),
    "1",
  );
});

test("another household sees no beliefs at all", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.certification_items;`, options), "0");
});

test("the review trail is readable by the whole household, on purpose", () => {
  // This is the deliberate exception the migration documents: unlike the
  // item it reviews, a review is a household-wide accountability record —
  // the bystander adult, who could not read the belief itself, can still
  // see that it was reviewed and by whom.
  assert.equal(
    asProfile(BYSTANDER, `select decision from public.certification_reviews where item_id = '${memberItem}';`, options),
    "confirmed",
  );
});

test("another household's member sees none of this household's review trail", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.certification_reviews;`, options), "0");
});

test("a member cannot write a review directly — only the admin client may", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.certification_reviews (household_id, item_id, reviewer_member_id, decision)
       values ('${household}', '${householdItem}', '${headMember}', 'confirmed');`,
      options,
    ),
    "a plain authenticated member could record their own review, bypassing reviewCertificationAction",
  );
});

test("a member cannot write a certification item directly either", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.certification_items (household_id, category, claim, scope, source_type, status, risk_level)
       values ('${household}', 'safety', 'Planted', 'household', 'setup', 'confirmed', 'low');`,
      options,
    ),
  );
});
