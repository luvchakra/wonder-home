#!/usr/bin/env node
/**
 * Kids Trivia (story 08-034). A child's topics, cards shown and settings are
 * seen only by the child, their guardians and the household's Admins. Topics,
 * cards and turned-away topics are written by the server only (no insert from
 * a session), so the safety check cannot be stepped round. The child sets
 * their own difficulty and removes their own topics; only a guardian or an
 * Admin turns Trivia on or off. Turned-away topics are for the guardian and
 * the Admins, not the child.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_child_trivia_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const GUARDIAN = "22222222-2222-4222-8222-222222222222";
const OTHER_ADULT = "33333333-3333-4333-8333-333333333333";
const CHILD = "44444444-4444-4444-8444-444444444444";
const OUTSIDER = "55555555-5555-4555-8555-555555555555";

let household = "";
let child = "";
let topic = "";

const member = (profile, type, name) => {
  psql(`insert into public.profiles (id, display_name) values ('${profile}', '${name}');`, options);
  const id = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${profile}', '${type}', '${name}') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${id}', '${type}');`, options);
  return id;
};

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${GUARDIAN}', 'priya@example.test'), ('${OTHER_ADULT}', 'ravi@example.test'), ('${CHILD}', 'asmi@example.test'), ('${OUTSIDER}', 'olu@example.test');`,
    options,
  );
  [household] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  const guardian = member(GUARDIAN, "adult", "Priya");
  member(OTHER_ADULT, "adult", "Ravi");
  child = member(CHILD, "child", "Asmi");
  psql(`insert into public.member_guardians (household_id, child_member_id, guardian_member_id) values ('${household}', '${child}', '${guardian}');`, options);
  asProfile(OUTSIDER, `select household_id from wh.create_household('Other Home', 'Olu');`, options);
  // What the server writes after its checks.
  topic = psql(`insert into public.trivia_topics (household_id, member_id, label, topic_key) values ('${household}', '${child}', 'Dinosaurs', 'dinosaurs') returning id;`, options);
  psql(`insert into public.trivia_topics (household_id, member_id, label, topic_key) values ('${household}', '${child}', 'Space', 'space');`, options);
  psql(`insert into public.trivia_shown (household_id, member_id, item_key, kind, topic, text) values ('${household}', '${child}', 'c:space-1', 'fact', 'Space', 'The Sun is a star.');`, options);
  psql(`insert into public.trivia_rejections (household_id, member_id, topic_hash, reason) values ('${household}', '${child}', '${"a".repeat(64)}', 'drugs');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("the child sees their own topics and cards, but not the turned-away list", () => {
  assert.equal(asProfile(CHILD, `select count(*) from public.trivia_topics;`, options), "2");
  assert.equal(asProfile(CHILD, `select count(*) from public.trivia_shown;`, options), "1");
  assert.equal(asProfile(CHILD, `select count(*) from public.trivia_rejections;`, options), "0");
});

test("no session writes a topic, a card or a turned-away topic: only the server does", () => {
  for (const who of [CHILD, HEAD]) {
    assert.throws(() => asProfile(who, `insert into public.trivia_topics (household_id, member_id, label, topic_key) values ('${household}', '${child}', 'Beer', 'beer');`, options), /permission denied/);
    assert.throws(() => asProfile(who, `insert into public.trivia_shown (household_id, member_id, item_key, kind, topic, text) values ('${household}', '${child}', 'c:x-1', 'fact', 'x', 'made up');`, options), /permission denied/);
    assert.throws(() => asProfile(who, `insert into public.trivia_rejections (household_id, member_id, topic_hash, reason) values ('${household}', '${child}', '${"b".repeat(64)}', 'hate');`, options), /permission denied/);
    assert.throws(() => asProfile(who, `update public.trivia_shown set answered_correct = true;`, options), /permission denied/);
  }
});

test("a guardian and an Admin see the child's topics, cards and turned-away count", () => {
  for (const who of [GUARDIAN, HEAD]) {
    assert.equal(asProfile(who, `select count(*) from public.trivia_topics;`, options), "2");
    assert.equal(asProfile(who, `select count(*) from public.trivia_shown;`, options), "1");
    assert.equal(asProfile(who, `select count(*) from public.trivia_rejections;`, options), "1");
  }
});

test("another adult who is not their guardian, and another household, see nothing and remove nothing", () => {
  for (const who of [OTHER_ADULT, OUTSIDER]) {
    assert.equal(asProfile(who, `select count(*) from public.trivia_topics;`, options), "0");
    assert.equal(asProfile(who, `select count(*) from public.trivia_shown;`, options), "0");
    assert.equal(asProfile(who, `select count(*) from public.trivia_rejections;`, options), "0");
    assert.equal(asProfile(who, `select count(*) from public.trivia_profiles;`, options), "0");
    asProfile(who, `delete from public.trivia_topics where id = '${topic}';`, options);
  }
  assert.equal(psql(`select count(*) from public.trivia_topics where id = '${topic}';`, options), "1");
});

test("the child sets their own difficulty but cannot turn Trivia off or back on", () => {
  asProfile(CHILD, `insert into public.trivia_profiles (household_id, member_id, level) values ('${household}', '${child}', 3);`, options);
  assert.equal(psql(`select level from public.trivia_profiles where member_id = '${child}';`, options), "3");
  assert.throws(() => asProfile(CHILD, `update public.trivia_profiles set enabled = false where member_id = '${child}';`, options), /guardian or an Admin/);
  asProfile(OTHER_ADULT, `update public.trivia_profiles set enabled = false, level = 1 where member_id = '${child}';`, options);
  assert.equal(psql(`select enabled::text || level from public.trivia_profiles where member_id = '${child}';`, options), "true3");
});

test("a guardian turns Trivia off and the child cannot turn it back on; an Admin can", () => {
  asProfile(GUARDIAN, `update public.trivia_profiles set enabled = false where member_id = '${child}';`, options);
  assert.equal(psql(`select enabled from public.trivia_profiles where member_id = '${child}';`, options), "f");
  assert.throws(() => asProfile(CHILD, `update public.trivia_profiles set enabled = true where member_id = '${child}';`, options), /guardian or an Admin/);
  asProfile(CHILD, `update public.trivia_profiles set level = 1 where member_id = '${child}';`, options);
  assert.equal(psql(`select enabled::text || level from public.trivia_profiles where member_id = '${child}';`, options), "false1");
  asProfile(HEAD, `update public.trivia_profiles set enabled = true where member_id = '${child}';`, options);
  assert.equal(psql(`select enabled from public.trivia_profiles where member_id = '${child}';`, options), "t");
});

test("the child removes their own topic; a guardian removes any of the child's", () => {
  asProfile(CHILD, `delete from public.trivia_topics where id = '${topic}';`, options);
  assert.equal(psql(`select count(*) from public.trivia_topics where member_id = '${child}';`, options), "1");
  asProfile(GUARDIAN, `delete from public.trivia_topics where member_id = '${child}';`, options);
  assert.equal(psql(`select count(*) from public.trivia_topics where member_id = '${child}';`, options), "0");
});

test("generated cards (08-035) are readable by any member and written only by the server; the queue and the cap are written by the server and read only by the household's Admins", () => {
  psql(`insert into public.trivia_pool (topic_key, age_band, language, kind, text) values ('space', 'older_child', 'en', 'fact', 'The Sun is a star.');`, options);
  psql(`insert into public.trivia_refill_queue (topic_key, age_band, language, label, household_id) values ('space', 'older_child', 'en', 'Space', '${household}');`, options);
  psql(`insert into public.trivia_generation_usage (household_id, day, batches) values ('${household}', current_date, 1);`, options);
  for (const who of [CHILD, OTHER_ADULT, OUTSIDER]) assert.equal(asProfile(who, `select count(*) from public.trivia_pool;`, options), "1");
  for (const who of [CHILD, HEAD]) {
    assert.throws(() => asProfile(who, `insert into public.trivia_pool (topic_key, age_band, language, kind, text) values ('space', 'older_child', 'en', 'fact', 'Made up by a session.');`, options), /permission denied/);
    assert.throws(() => asProfile(who, `update public.trivia_pool set text = 'changed';`, options), /permission denied/);
    assert.throws(() => asProfile(who, `insert into public.trivia_refill_queue (topic_key, age_band, language, label, household_id) values ('x', 'teen', 'en', 'X', '${household}');`, options), /permission denied/);
    assert.throws(() => asProfile(who, `update public.trivia_generation_usage set batches = 0;`, options), /permission denied/);
  }
  // The household's Admins read their own queue and usage; a child, another adult and another household read none.
  assert.equal(asProfile(HEAD, `select count(*) from public.trivia_refill_queue;`, options), "1");
  assert.equal(asProfile(HEAD, `select count(*) from public.trivia_generation_usage;`, options), "1");
  for (const who of [CHILD, OTHER_ADULT, OUTSIDER]) {
    assert.equal(asProfile(who, `select count(*) from public.trivia_refill_queue;`, options), "0");
    assert.equal(asProfile(who, `select count(*) from public.trivia_generation_usage;`, options), "0");
  }
});

test("a generated card is a fact or a quiz with 3–4 choices and an answer, never half of one", () => {
  assert.throws(() => psql(`insert into public.trivia_pool (topic_key, age_band, language, kind, text, options) values ('space', 'teen', 'en', 'quiz', 'Which planet is biggest?', '["Mars","Jupiter","Venus"]');`, options), /check/);
  assert.throws(() => psql(`insert into public.trivia_pool (topic_key, age_band, language, kind, text, options, answer) values ('space', 'teen', 'en', 'quiz', 'Which planet is biggest?', '["Mars","Jupiter"]', 1);`, options), /check/);
  psql(`insert into public.trivia_pool (topic_key, age_band, language, kind, text, options, answer) values ('space', 'teen', 'en', 'quiz', 'Which planet is biggest?', '["Mars","Jupiter","Venus"]', 1);`, options);
});
