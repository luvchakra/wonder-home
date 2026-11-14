#!/usr/bin/env node
/**
 * The one "Needs you" list (2026-11-14, decision 4).
 *
 * `needs_you_items` holds the questions WonderHome asks a person, each with a
 * default that applies after 24 hours. So:
 *   - a question for a named person is seen by them and the household's Admins;
 *   - a question for "the Admins" (no recipient) is seen only by Admins;
 *   - another household sees nothing;
 *   - an answer is in the answerer's own name, and its default and deadlines
 *     are never changed by hand; a closed question stays closed;
 *   - nothing stays open past 48 hours (the deadlines check).
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_needs_you_test";
const options = { database: DB };

const HEAD = "41111111-1111-4111-8111-111111111111";
const PARTNER = "42222222-2222-4222-8222-222222222222";
const OUTSIDER = "43333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let partnerMember = "";
let forPartner = "";
let forAdmins = "";

const insert = (recipient, subject) =>
  psql(
    `insert into public.needs_you_items (household_id, source, subject_table, subject_id, recipient_member_id, prompt, answers, default_answer, default_at, expires_at)
     values ('${household}', 'homesend_check', 'home_send_items', '${subject}', ${recipient ? `'${recipient}'` : "null"}, '{"code":"homesend.check"}', '[{"value":"looks_right"}]', 'looks_right', now() + interval '24 hours', now() + interval '48 hours') returning id;`,
    options,
  );

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'), ('${PARTNER}', 'upasana@example.test'), ('${OUTSIDER}', 'arjun@example.test');`,
    options,
  );
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Mehta Home', 'Kunal');`, options).split(" ");
  asProfile(OUTSIDER, `select household_id from wh.create_household('Arjun Home', 'Arjun');`, options);
  psql(`insert into public.profiles (id, display_name) values ('${PARTNER}', 'Upasana');`, options);
  partnerMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${PARTNER}', 'adult', 'Upasana') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${partnerMember}', 'adult');`, options);
  forPartner = insert(partnerMember, "51111111-1111-4111-8111-111111111111");
  forAdmins = insert(null, "52222222-2222-4222-8222-222222222222");
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("the person asked, and the Admins, see a question for that person", () => {
  assert.equal(asProfile(PARTNER, `select count(*) from public.needs_you_items where id = '${forPartner}';`, options), "1");
  assert.equal(asProfile(HEAD, `select count(*) from public.needs_you_items where id = '${forPartner}';`, options), "1");
});

test("a question for the Admins is not seen by an adult who isn't one", () => {
  assert.equal(asProfile(PARTNER, `select count(*) from public.needs_you_items where id = '${forAdmins}';`, options), "0");
  assert.equal(asProfile(HEAD, `select count(*) from public.needs_you_items where id = '${forAdmins}';`, options), "1");
});

test("another household sees nothing", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.needs_you_items;`, options), "0");
  assert.ok(deniedForProfile(OUTSIDER, `update public.needs_you_items set status = 'answered', answer = 'looks_right', resolved_at = now() where id = '${forPartner}' returning id;`, options) || asProfile(OUTSIDER, `update public.needs_you_items set status = 'answered', answer = 'looks_right', resolved_at = now() where id = '${forPartner}' returning id;`, options) === "");
});

test("an answer is in the answerer's own name", () => {
  assert.ok(
    deniedForProfile(PARTNER, `update public.needs_you_items set status = 'answered', answer = 'looks_right', answered_by_member_id = '${headMember}', resolved_at = now() where id = '${forPartner}';`, options),
    "answered in someone else's name",
  );
});

test("a question's default and deadlines are never changed by hand", () => {
  assert.ok(deniedForProfile(PARTNER, `update public.needs_you_items set default_at = now() + interval '30 days' where id = '${forPartner}';`, options));
  assert.ok(deniedForProfile(PARTNER, `update public.needs_you_items set default_answer = 'not_right' where id = '${forPartner}';`, options));
});

test("answered once, it stays closed", () => {
  asProfile(PARTNER, `update public.needs_you_items set status = 'answered', answer = 'looks_right', answered_by_member_id = '${partnerMember}', resolved_at = now() where id = '${forPartner}';`, options);
  assert.equal(psql(`select status from public.needs_you_items where id = '${forPartner}';`, options), "answered");
  assert.ok(deniedForProfile(PARTNER, `update public.needs_you_items set status = 'open', resolved_at = null where id = '${forPartner}';`, options));
});

test("nothing is asked with more than 48 hours to wait, and one open question per thing", () => {
  assert.throws(() =>
    psql(
      `insert into public.needs_you_items (household_id, source, subject_table, subject_id, prompt, answers, default_answer, default_at, expires_at)
       values ('${household}', 'homesend_check', 'home_send_items', gen_random_uuid(), '{"code":"x"}', '[{"value":"note"}]', 'note', now() + interval '24 hours', now() + interval '72 hours');`,
      options,
    ),
  );
  assert.throws(() => insert(null, "52222222-2222-4222-8222-222222222222"));
});
