#!/usr/bin/env node
/**
 * A child's goals and the days they kept them (story 08-017).
 *
 * The child, their guardians and Admins read them. Guardians and Admins set
 * and change goals; the child never does. The child (or a guardian) ticks
 * off a day and takes it back, once per day per goal, never ahead of time
 * and never for a retired goal. An adult who is not the child's guardian
 * reads nothing, and another household sees nothing at all.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_child_goals_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const KID = "44444444-4444-4444-8444-444444444444";

let household = "";
let adultMember = "";
let child = "";
let outsiderHousehold = "";
let goal = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test'), ('${OUTSIDER}', 'olu@example.test'), ('${KID}', 'anaya@example.test');`,
    options,
  );
  let headMember = "";
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya'), ('${KID}', 'Anaya');`, options);
  adultMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  // Kunal is Anaya's guardian; Priya, an adult of the household, is not.
  child = asProfile(HEAD, `select wh.create_child_member('${household}', 'Anaya', '2016-09-18', array['${headMember}']::uuid[]);`, options);
  psql(`update public.household_members set profile_id = '${KID}' where id = '${child}';`, options);
  outsiderHousehold = asProfile(OUTSIDER, `select household_id from wh.create_household('Other Home', 'Olu');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a guardian sets a goal with the child", () => {
  goal = asProfile(
    HEAD,
    `insert into public.child_goals (household_id, child_member_id, title, kind, emoji, period, target, stars, reward) values ('${household}', '${child}', 'Practise piano', 'practice', '🎹', 'week', 3, 2, 'Pick Friday''s movie') returning id;`,
    options,
  );
  assert.equal(asProfile(HEAD, `select count(*) from public.child_goals;`, options), "1");
});

test("the child reads the goal but cannot change it or set their own", () => {
  assert.equal(asProfile(KID, `select count(*) from public.child_goals;`, options), "1");
  asProfile(KID, `update public.child_goals set stars = 5;`, options);
  assert.equal(psql(`select stars from public.child_goals where id = '${goal}';`, options), "2");
  assert.throws(
    () => asProfile(KID, `insert into public.child_goals (household_id, child_member_id, title) values ('${household}', '${child}', 'No bedtime');`, options),
    /row-level security/,
  );
});

test("the child ticks off today once, and takes it back", () => {
  asProfile(KID, `insert into public.child_goal_checkins (household_id, goal_id, child_member_id, on_day) values ('${household}', '${goal}', '${child}', current_date);`, options);
  assert.throws(
    () => asProfile(KID, `insert into public.child_goal_checkins (household_id, goal_id, child_member_id, on_day) values ('${household}', '${goal}', '${child}', current_date);`, options),
    /duplicate key/,
  );
  assert.equal(asProfile(HEAD, `select count(*) from public.child_goal_checkins;`, options), "1");
  asProfile(KID, `delete from public.child_goal_checkins where goal_id = '${goal}';`, options);
  assert.equal(psql(`select count(*) from public.child_goal_checkins;`, options), "0");
});

test("a day is never claimed ahead", () => {
  assert.throws(
    () => asProfile(KID, `insert into public.child_goal_checkins (household_id, goal_id, child_member_id, on_day) values ('${household}', '${goal}', '${child}', current_date + 5);`, options),
    /row-level security/,
  );
});

test("an adult who is not the child's guardian neither reads nor writes", () => {
  assert.equal(asProfile(ADULT, `select count(*) from public.child_goals;`, options), "0");
  assert.throws(
    () => asProfile(ADULT, `insert into public.child_goals (household_id, child_member_id, title) values ('${household}', '${child}', 'Read');`, options),
    /row-level security/,
  );
  assert.throws(
    () => asProfile(ADULT, `insert into public.child_goal_checkins (household_id, goal_id, child_member_id, on_day) values ('${household}', '${goal}', '${child}', current_date);`, options),
    /row-level security/,
  );
});

test("another household sees nothing and cannot tick anything off", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.child_goals;`, options), "0");
  assert.throws(
    () => asProfile(OUTSIDER, `insert into public.child_goal_checkins (household_id, goal_id, child_member_id, on_day) values ('${outsiderHousehold}', '${goal}', '${child}', current_date);`, options),
    /row-level security/,
  );
});

test("the child's own Done waits for a grown-up: they cannot verify it themselves", () => {
  const headMember = psql(`select id from public.household_members where profile_id = '${HEAD}';`, options);
  const kidMember = child;
  assert.throws(
    () => asProfile(KID, `insert into public.child_goal_checkins (household_id, goal_id, child_member_id, on_day, verified_at, verified_by) values ('${household}', '${goal}', '${child}', current_date, now(), '${kidMember}');`, options),
    /row-level security/,
  );
  asProfile(KID, `insert into public.child_goal_checkins (household_id, goal_id, child_member_id, on_day) values ('${household}', '${goal}', '${child}', current_date);`, options);
  asProfile(KID, `update public.child_goal_checkins set verified_at = now(), verified_by = '${kidMember}' where goal_id = '${goal}';`, options);
  assert.equal(psql(`select count(*) from public.child_goal_checkins where verified_at is null;`, options), "1");
  // The guardian says yes, in their own name only.
  assert.throws(
    () => asProfile(HEAD, `update public.child_goal_checkins set verified_at = now(), verified_by = '${adultMember}' where goal_id = '${goal}';`, options),
    /row-level security/,
  );
  asProfile(HEAD, `update public.child_goal_checkins set verified_at = now(), verified_by = '${headMember}' where goal_id = '${goal}';`, options);
  assert.equal(psql(`select count(*) from public.child_goal_checkins where verified_at is not null;`, options), "1");
  // Once verified, the child no longer takes it back; the guardian may.
  asProfile(KID, `delete from public.child_goal_checkins where goal_id = '${goal}';`, options);
  assert.equal(psql(`select count(*) from public.child_goal_checkins;`, options), "1");
  asProfile(HEAD, `delete from public.child_goal_checkins where goal_id = '${goal}';`, options);
  assert.equal(psql(`select count(*) from public.child_goal_checkins;`, options), "0");
});

test("a guardian's own tick is verified as it is made", () => {
  const headMember = psql(`select id from public.household_members where profile_id = '${HEAD}';`, options);
  asProfile(HEAD, `insert into public.child_goal_checkins (household_id, goal_id, child_member_id, on_day, verified_at, verified_by) values ('${household}', '${goal}', '${child}', current_date, now(), '${headMember}');`, options);
  assert.equal(psql(`select count(*) from public.child_goal_checkins where verified_by = '${headMember}';`, options), "1");
  psql(`delete from public.child_goal_checkins;`, options);
});

test("only a child has goals, and a weekly target fits a week", () => {
  assert.throws(
    () => asProfile(HEAD, `insert into public.child_goals (household_id, child_member_id, title) values ('${household}', '${adultMember}', 'Run');`, options),
    /row-level security/,
  );
  assert.throws(
    () => asProfile(HEAD, `insert into public.child_goals (household_id, child_member_id, title, period, target) values ('${household}', '${child}', 'Read', 'day', 3);`, options),
    /child_goals_target_fits/,
  );
});

test("a retired goal keeps its days and takes no new ones", () => {
  asProfile(KID, `insert into public.child_goal_checkins (household_id, goal_id, child_member_id, on_day) values ('${household}', '${goal}', '${child}', current_date - 1);`, options);
  asProfile(HEAD, `update public.child_goals set active = false where id = '${goal}';`, options);
  assert.equal(psql(`select count(*) from public.child_goal_checkins where goal_id = '${goal}';`, options), "1");
  assert.throws(
    () => asProfile(KID, `insert into public.child_goal_checkins (household_id, goal_id, child_member_id, on_day) values ('${household}', '${goal}', '${child}', current_date);`, options),
    /row-level security/,
  );
});
