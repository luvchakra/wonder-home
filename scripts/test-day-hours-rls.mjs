#!/usr/bin/env node
/**
 * School hours and office hours (HomePlaces follow-up).
 *
 * The hours ride on rows whose policies already exist — a child's
 * enrolment (guardians and Admins) and a member (themselves, or an Admin) —
 * so what is under test is that those still decide, and that the columns
 * refuse what can never be a usual day: half a pair, a school day that ends
 * before it starts, and office hours on anyone but an adult.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_day_hours_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";

let household = "";
let headMember = "";
let adultMember = "";
let child = "";

function digest(token) {
  return psql(`select encode(digest('${token}', 'sha256'), 'hex');`, options);
}

before(() => {
  buildTestDatabase(DB);
  psql(`create extension if not exists pgcrypto;`, options);
  psql(`insert into auth.users (id, email) values ('${HEAD}', 'head@example.test'), ('${ADULT}', 'adult@example.test');`, options);
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Sharma Home', 'Kunal');`, options).split(" ");
  psql(
    `insert into public.household_invitations (household_id, invited_by_member_id, email, display_name, role, token_hash, expires_at)
     values ('${household}', '${headMember}', 'adult@example.test', 'Asha', 'adult', '${digest("token-adult-0000000000000000000000000")}', now() + interval '7 days');`,
    options,
  );
  asProfile(ADULT, `select wh.accept_invitation('${digest("token-adult-0000000000000000000000000")}', 'Asha');`, options);
  adultMember = psql(`select id from public.household_members where profile_id = '${ADULT}';`, options);
  child = asProfile(HEAD, `select wh.create_child_member('${household}', 'Aarav', '2016-04-01'::date, array['${headMember}']::uuid[]);`, options);
  asProfile(HEAD, `insert into public.school_enrolments (household_id, child_member_id, school_name) values ('${household}', '${child}', 'Greenwood High');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("an adult keeps their own office hours, a night shift included", () => {
  asProfile(ADULT, `update public.household_members set work_starts_at = '22:00', work_ends_at = '06:00' where id = '${adultMember}';`, options);
  assert.equal(psql(`select work_ends_at from public.household_members where id = '${adultMember}';`, options), "06:00:00");
});

test("half a pair, or the same time twice, is refused", () => {
  assert.ok(deniedForProfile(ADULT, `update public.household_members set work_starts_at = '09:00', work_ends_at = null where id = '${adultMember}';`, options));
  assert.ok(deniedForProfile(ADULT, `update public.household_members set work_starts_at = '09:00', work_ends_at = '09:00' where id = '${adultMember}';`, options));
});

test("only an adult keeps office hours", () => {
  assert.ok(deniedForProfile(HEAD, `update public.household_members set work_starts_at = '09:00', work_ends_at = '17:00' where id = '${child}';`, options));
});

test("a non-Admin adult cannot set someone else's office hours", () => {
  asProfile(ADULT, `update public.household_members set work_starts_at = '09:00', work_ends_at = '17:00' where id = '${headMember}';`, options);
  assert.equal(psql(`select coalesce(work_starts_at::text, 'none') from public.household_members where id = '${headMember}';`, options), "none");
});

test("a guardian sets the school day; it never ends before it starts", () => {
  asProfile(HEAD, `update public.school_enrolments set starts_at = '08:00', ends_at = '15:10' where child_member_id = '${child}';`, options);
  assert.equal(psql(`select ends_at from public.school_enrolments where child_member_id = '${child}';`, options), "15:10:00");
  assert.ok(deniedForProfile(HEAD, `update public.school_enrolments set starts_at = '15:00', ends_at = '08:00' where child_member_id = '${child}';`, options));
});

test("a non-guardian adult cannot change a child's school day", () => {
  asProfile(ADULT, `update public.school_enrolments set starts_at = '07:00', ends_at = '12:00' where child_member_id = '${child}';`, options);
  assert.equal(psql(`select starts_at from public.school_enrolments where child_member_id = '${child}';`, options), "08:00:00");
});
