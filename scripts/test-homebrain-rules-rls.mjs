#!/usr/bin/env node
/**
 * HomeBrain knows (Nothing stuck in review, phase 3) database tests.
 *
 * Household rules (`homesend_learned_defaults`, now every rule kind) stay in
 * their household, are written as yourself, a member value names someone of
 * the same household, a word value never carries money, and only an Admin
 * forgets. Each kind's bar (`homebrain_kind_bars`) is read by members and
 * written only by the service role, within 80–99%. The accuracy columns on
 * `homesend_changes` keep their shape.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_homebrain_rules_test";
const options = { database: DB };

const HEAD = "41111111-1111-4111-8111-111111111111";
const OTHER_ADULT = "42222222-2222-4222-8222-222222222222";
const OUTSIDER = "43333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let otherMember = "";
let child = "";
let otherHousehold = "";
let outsiderMember = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'head@example.test'),
       ('${OTHER_ADULT}', 'adult@example.test'),
       ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Rao Home', 'Simran');`, options).split(" ");
  [otherHousehold, outsiderMember] = asProfile(OUTSIDER, `select household_id || ' ' || member_id from wh.create_household('Outsider Home', 'Outsider');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${OTHER_ADULT}', 'Another adult');`, options);
  otherMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${OTHER_ADULT}', 'adult', 'Another adult') returning id;`,
    options,
  );
  child = psql(`insert into public.household_members (household_id, member_type, display_name) values ('${household}', 'child', 'Anya') returning id;`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

const insertRule = (kind, key, { member = null, text = null, by = headMember, into = household } = {}) =>
  `insert into public.homesend_learned_defaults (household_id, kind, key, value_member_id, value_text, learned_by_member_id, source)
   values ('${into}', '${kind}', '${key.replace(/'/g, "''")}', ${member ? `'${member}'` : "null"}, ${text ? `'${text.replace(/'/g, "''")}'` : "null"}, '${by}', 'correction');`;

test("every rule kind is written as yourself and seen only by your household", () => {
  asProfile(HEAD, insertRule("sender_area", "sender:billing@power.example", { text: "bill" }), options);
  asProfile(HEAD, insertRule("vendor_category", "vendor:power co", { text: "electricity" }), options);
  asProfile(OTHER_ADULT, insertRule("phrase_item", "phrase:atta", { text: "Atta (wheat flour)", by: otherMember }), options);
  asProfile(HEAD, insertRule("place_alias", "place:nani's", { text: "Nani's house" }), options);
  asProfile(HEAD, insertRule("sender_person", "sender:coach@club.example", { member: otherMember }), options);
  assert.equal(asProfile(OTHER_ADULT, `select count(*) from public.homesend_learned_defaults;`, options), "5");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.homesend_learned_defaults;`, options), "0");
});

test("a rule never crosses households", () => {
  assert.ok(deniedForProfile(HEAD, insertRule("sender_person", "sender:x@y.example", { member: outsiderMember }), options), "a rule named another household's member");
  assert.ok(deniedForProfile(OUTSIDER, insertRule("vendor_category", "vendor:shop", { text: "groceries", by: outsiderMember }), options), "an outsider wrote a rule into the household");
  assert.ok(deniedForProfile(OTHER_ADULT, insertRule("phrase_item", "phrase:dal", { text: "Toor dal", by: headMember }), options), "a member taught a rule in another member's name");
  // An outsider can't change one either.
  asProfile(OUTSIDER, `update public.homesend_learned_defaults set value_text = 'groceries' where household_id = '${household}';`, options);
  assert.equal(psql(`select value_text from public.homesend_learned_defaults where household_id = '${household}' and kind = 'vendor_category';`, options), "electricity");
});

test("a rule's value has the right shape and never carries money", () => {
  // A word kind with a member, or a member kind with words, is refused.
  assert.throws(() => psql(insertRule("sender_area", "sender:a@b.example", { member: child }), options));
  assert.throws(() => psql(insertRule("sender_person", "sender:c@d.example", { text: "Anya" }), options));
  assert.throws(() => psql(insertRule("sender_child", "sender:e@f.example"), options));
  // No currency in a rule.
  assert.throws(() => psql(insertRule("vendor_category", "vendor:bank", { text: "₹5,000 limit" }), options));
  assert.throws(() => psql(insertRule("phrase_item", "phrase:milk", { text: "$4 milk" }), options));
  // Only the kinds HomeBrain knows: never approval or permission.
  assert.throws(() => psql(insertRule("approve_money", "sender:g@h.example", { text: "yes" }), options));
  assert.throws(() => psql(insertRule("permission", "sender:g@h.example", { text: "admin" }), options));
  // The 14-066 rows still go in exactly as before.
  psql(
    `insert into public.homesend_learned_defaults (household_id, kind, key, value_member_id, learned_by_member_id) values ('${household}', 'sender_child', 'sender:class2@school.example', '${child}', '${headMember}');`,
    options,
  );
  assert.equal(psql(`select source || ' ' || times from public.homesend_learned_defaults where key = 'sender:class2@school.example';`, options), "answer 1");
});

test("only an Admin forgets a rule", () => {
  const before = psql(`select count(*) from public.homesend_learned_defaults where household_id = '${household}';`, options);
  asProfile(OTHER_ADULT, `delete from public.homesend_learned_defaults where household_id = '${household}';`, options);
  assert.equal(psql(`select count(*) from public.homesend_learned_defaults where household_id = '${household}';`, options), before);
  asProfile(HEAD, `delete from public.homesend_learned_defaults where household_id = '${household}' and kind = 'place_alias';`, options);
  assert.equal(psql(`select count(*) from public.homesend_learned_defaults where household_id = '${household}' and kind = 'place_alias';`, options), "0");
});

test("each kind's bar is read by the household and written only by the service role, within 80–99%", () => {
  psql(`insert into public.homebrain_kind_bars (household_id, kind, percent, added, undone, corrected) values ('${household}', 'grocery_item', 85, 40, 0, 0);`, options);
  assert.equal(asProfile(OTHER_ADULT, `select percent from public.homebrain_kind_bars where kind = 'grocery_item';`, options), "85");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.homebrain_kind_bars;`, options), "0");
  assert.ok(deniedForProfile(HEAD, `insert into public.homebrain_kind_bars (household_id, kind, percent) values ('${household}', 'bill', 80);`, options), "a member wrote a bar");
  asProfile(HEAD, `update public.homebrain_kind_bars set percent = 80 where household_id = '${household}';`, options);
  asProfile(HEAD, `delete from public.homebrain_kind_bars where household_id = '${household}';`, options);
  assert.equal(psql(`select percent from public.homebrain_kind_bars where household_id = '${household}' and kind = 'grocery_item';`, options), "85");
  assert.throws(() => psql(`insert into public.homebrain_kind_bars (household_id, kind, percent) values ('${household}', 'bill', 70);`, options));
  assert.throws(() => psql(`insert into public.homebrain_kind_bars (household_id, kind, percent) values ('${household}', 'unknown', 95);`, options));
  assert.ok(otherHousehold);
});

test("an entry's correction and confirmation basis keep their shape", () => {
  const item = asProfile(HEAD, `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text) values ('${household}', '${headMember}', 'pasted_text', 'Milk') returning id;`, options);
  const change = asProfile(
    HEAD,
    `insert into public.homesend_changes (household_id, intake_id, domain, entity_id, created_by_member_id) values ('${household}', '${item}', 'grocery_item', gen_random_uuid(), '${headMember}') returning id;`,
    options,
  );
  // A member marks their correction.
  asProfile(HEAD, `update public.homesend_changes set corrected_at = now(), corrected_field = 'item', corrected_by_member_id = '${headMember}' where id = '${change}';`, options);
  assert.equal(psql(`select corrected_field from public.homesend_changes where id = '${change}';`, options), "item");
  assert.throws(() => psql(`update public.homesend_changes set corrected_field = 'approval' where id = '${change}';`, options));
  assert.throws(() => psql(`update public.homesend_changes set corrected_at = null where id = '${change}';`, options));
  assert.throws(() => psql(`update public.homesend_changes set confirmed_basis = 'model_said_so' where id = '${change}';`, options));
  psql(`update public.homesend_changes set confirmed_basis = 'recurring' where id = '${change}';`, options);
  // An outsider can't touch it.
  asProfile(OUTSIDER, `update public.homesend_changes set corrected_field = 'date' where id = '${change}';`, options);
  assert.equal(psql(`select corrected_field from public.homesend_changes where id = '${change}';`, options), "item");
});
