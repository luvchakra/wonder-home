#!/usr/bin/env node
/**
 * A child's school timetable and exams (story 08-015).
 *
 * They follow school data, as a child's classes do: the child, their
 * guardians and Admins read them; guardians and Admins change them. An adult
 * who is not the child's guardian reads nothing, the child reads but never
 * writes, and another household sees nothing at all. An exam's papers follow
 * the exam, a material link must be a web address, and any adult may add an
 * exam type of the household's own.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_school_exams_test";
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
let exam = "";

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

test("a guardian fills in the timetable, an exam and its papers", () => {
  asProfile(
    HEAD,
    `insert into public.school_timetable_periods (household_id, child_member_id, weekday, starts_at, ends_at, subject, teacher_name) values
       ('${household}', '${child}', 1, '08:00', '08:40', 'Maths', 'Mr Iyer'),
       ('${household}', '${child}', 1, '08:40', '09:20', 'English', null);`,
    options,
  );
  exam = asProfile(HEAD, `insert into public.school_exams (household_id, child_member_id, exam_type, title) values ('${household}', '${child}', 'Mid-term', 'Term 1') returning id;`, options);
  asProfile(
    HEAD,
    `insert into public.school_exam_papers (household_id, exam_id, subject, on_date, starts_at, ends_at, syllabus, links) values
       ('${household}', '${exam}', 'Maths', '2026-11-02', '09:00', '11:00', 'Chapters 1-4', array['https://school.example/maths.pdf']),
       ('${household}', '${exam}', 'Science', '2026-11-04', '09:00', '11:00', null, '{}');`,
    options,
  );
  assert.equal(asProfile(HEAD, `select count(*) from public.school_timetable_periods;`, options), "2");
  assert.equal(asProfile(HEAD, `select count(*) from public.school_exam_papers;`, options), "2");
});

test("the child reads their own timetable and exams, but does not change them", () => {
  assert.equal(asProfile(KID, `select count(*) from public.school_timetable_periods;`, options), "2");
  assert.equal(asProfile(KID, `select count(*) from public.school_exams;`, options), "1");
  assert.equal(asProfile(KID, `select count(*) from public.school_exam_papers;`, options), "2");
  asProfile(KID, `update public.school_exam_papers set syllabus = 'Nothing';`, options);
  assert.equal(psql(`select syllabus from public.school_exam_papers where subject = 'Maths';`, options), "Chapters 1-4");
  assert.throws(() => asProfile(KID, `insert into public.school_exams (household_id, child_member_id, exam_type) values ('${household}', '${child}', 'Finals');`, options), /row-level security/);
});

test("an adult who is not the child's guardian, and another household, see none of it", () => {
  assert.equal(asProfile(ADULT, `select count(*) from public.school_timetable_periods;`, options), "0");
  assert.equal(asProfile(ADULT, `select count(*) from public.school_exam_papers;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.school_exams;`, options), "0");
  assert.throws(() => asProfile(ADULT, `insert into public.school_exam_papers (household_id, exam_id, subject, on_date) values ('${household}', '${exam}', 'Art', '2026-11-05');`, options), /row-level security/);
  assert.throws(() => asProfile(OUTSIDER, `insert into public.school_timetable_periods (household_id, child_member_id, weekday, starts_at, ends_at, subject) values ('${outsiderHousehold}', '${child}', 2, '08:00', '09:00', 'Maths');`, options), /row-level security/);
});

test("any adult adds an exam type of the household's own; a child cannot; names are unique", () => {
  asProfile(ADULT, `insert into public.school_exam_types (household_id, name) values ('${household}', 'Olympiad');`, options);
  assert.equal(asProfile(KID, `select count(*) from public.school_exam_types;`, options), "1");
  assert.throws(() => asProfile(KID, `insert into public.school_exam_types (household_id, name) values ('${household}', 'Quiz');`, options), /row-level security/);
  assert.throws(() => asProfile(HEAD, `insert into public.school_exam_types (household_id, name) values ('${household}', ' olympiad ');`, options), /duplicate key|unique/);
});

test("a material link is a web address, a period ends after it starts, and only ten links fit", () => {
  assert.throws(() => asProfile(HEAD, `insert into public.school_exam_papers (household_id, exam_id, subject, on_date, links) values ('${household}', '${exam}', 'Art', '2026-11-05', array['javascript:alert(1)']);`, options), /web address/);
  assert.throws(() => asProfile(HEAD, `insert into public.school_timetable_periods (household_id, child_member_id, weekday, starts_at, ends_at, subject) values ('${household}', '${child}', 2, '10:00', '09:00', 'Maths');`, options), /times_ordered/);
  const eleven = Array.from({ length: 11 }, (_, index) => `'https://a.example/${index}'`).join(",");
  assert.throws(() => asProfile(HEAD, `insert into public.school_exam_papers (household_id, exam_id, subject, on_date, links) values ('${household}', '${exam}', 'Art', '2026-11-05', array[${eleven}]);`, options), /check/);
});

test("a write marks HomeBrain's stored context stale", () => {
  psql(`insert into public.household_context (household_id, version, document, sections, unavailable, size_bytes, stale_since, built_at) values ('${household}', 1, '[]', '{}', '[]', 2, null, now() - interval '1 minute') on conflict (household_id) do update set stale_since = null, built_at = now() - interval '1 minute';`, options);
  asProfile(HEAD, `update public.school_exam_papers set syllabus = 'Chapters 1-5' where subject = 'Maths';`, options);
  assert.equal(psql(`select (stale_since is not null and stale_since >= built_at)::text from public.household_context where household_id = '${household}';`, options), "true");
});
