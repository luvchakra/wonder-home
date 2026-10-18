#!/usr/bin/env node
/**
 * A child's teachers and classes outside school (stories 08-010, 08-011).
 *
 * They follow school data: the child, their guardians and Admins read them;
 * guardians and Admins change them. An adult who is not the child's guardian
 * reads nothing, the child reads but never writes, and another household
 * sees nothing at all. A row's child must be a child of its own household,
 * and a class's notes follow the class.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_child_activities_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const KID = "44444444-4444-4444-8444-444444444444";

let household = "";
let headMember = "";
let adultMember = "";
let child = "";
let outsiderHousehold = "";
let activity = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test'), ('${OUTSIDER}', 'olu@example.test'), ('${KID}', 'anaya@example.test');`,
    options,
  );
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

test("a guardian adds the class teacher, a subject teacher and a class", () => {
  asProfile(
    HEAD,
    `insert into public.school_teachers (household_id, child_member_id, role, name) values ('${household}', '${child}', 'class_teacher', 'Mrs Rao');
     insert into public.school_teachers (household_id, child_member_id, role, subject, name) values ('${household}', '${child}', 'subject_teacher', 'Maths', 'Mr Iyer');`,
    options,
  );
  activity = asProfile(
    HEAD,
    `insert into public.child_activities (household_id, child_member_id, name, kind, days, starts_at, ends_at) values ('${household}', '${child}', 'Piano', 'music', '{2,4}', '17:00', '18:00') returning id;`,
    options,
  );
  asProfile(HEAD, `insert into public.child_activity_notes (household_id, activity_id, kind, title, result) values ('${household}', '${activity}', 'award', 'Grade 2 exam', 'Distinction');`, options);
  assert.equal(asProfile(HEAD, `select count(*) from public.school_teachers;`, options), "2");
  assert.equal(asProfile(HEAD, `select count(*) from public.child_activity_notes;`, options), "1");
});

test("the child reads their own teachers and classes, but does not change them", () => {
  assert.equal(asProfile(KID, `select count(*) from public.school_teachers;`, options), "2");
  assert.equal(asProfile(KID, `select count(*) from public.child_activities;`, options), "1");
  assert.equal(asProfile(KID, `select count(*) from public.child_activity_notes;`, options), "1");
  asProfile(KID, `update public.child_activities set name = 'Guitar';`, options);
  assert.equal(psql(`select name from public.child_activities where id = '${activity}';`, options), "Piano");
  assert.throws(() => asProfile(KID, `insert into public.school_teachers (household_id, child_member_id, role, name) values ('${household}', '${child}', 'class_teacher', 'Me');`, options), /row-level security/);
});

test("an adult who is not the child's guardian neither reads nor writes them", () => {
  assert.equal(asProfile(ADULT, `select count(*) from public.school_teachers;`, options), "0");
  assert.equal(asProfile(ADULT, `select count(*) from public.child_activities;`, options), "0");
  assert.equal(asProfile(ADULT, `select count(*) from public.child_activity_notes;`, options), "0");
  assert.throws(
    () => asProfile(ADULT, `insert into public.child_activities (household_id, child_member_id, name) values ('${household}', '${child}', 'Karate');`, options),
    /row-level security/,
  );
});

test("another household sees nothing, and cannot attach rows to this child", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.school_teachers;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.child_activities;`, options), "0");
  assert.throws(
    () => asProfile(OUTSIDER, `insert into public.child_activities (household_id, child_member_id, name) values ('${outsiderHousehold}', '${child}', 'Karate');`, options),
    /row-level security/,
  );
  assert.throws(
    () => asProfile(OUTSIDER, `insert into public.child_activity_notes (household_id, activity_id, kind, title) values ('${outsiderHousehold}', '${activity}', 'note', 'Hi');`, options),
    /row-level security/,
  );
});

test("only a child has teachers or classes", () => {
  assert.throws(
    () => asProfile(HEAD, `insert into public.child_activities (household_id, child_member_id, name) values ('${household}', '${adultMember}', 'Yoga');`, options),
    /row-level security/,
  );
});

test("a subject teacher names the subject, and a schedule reads forwards", () => {
  assert.throws(() => asProfile(HEAD, `insert into public.school_teachers (household_id, child_member_id, role, name) values ('${household}', '${child}', 'subject_teacher', 'Ms Das');`, options), /school_teachers_subject_for_subject_teacher/);
  assert.throws(
    () => asProfile(HEAD, `insert into public.child_activities (household_id, child_member_id, name, starts_at, ends_at) values ('${household}', '${child}', 'Swim', '18:00', '17:00');`, options),
    /child_activities_times_ordered/,
  );
  assert.throws(() => asProfile(HEAD, `insert into public.child_activities (household_id, child_member_id, name, days) values ('${household}', '${child}', 'Swim', '{8}');`, options), /check/);
});

test("a stood-down class keeps its notes", () => {
  asProfile(HEAD, `update public.child_activities set active = false where id = '${activity}';`, options);
  assert.equal(psql(`select count(*) from public.child_activity_notes where activity_id = '${activity}';`, options), "1");
});
