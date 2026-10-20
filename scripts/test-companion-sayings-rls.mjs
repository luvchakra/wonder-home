#!/usr/bin/env node
/**
 * The cat's sayings (story 08-018; the owner, 2026-10-20: "never repeat
 * these for a child").
 *
 * Every member reads the list and nobody writes it from a session. The cat
 * picks only sayings that suit the child's age (and gender, when a saying was
 * chosen for one) and that this child has not heard; once one is recorded as
 * heard it is never picked for them again. A person records only what they
 * themselves heard, and reads only their own.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_companion_sayings_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const KID = "44444444-4444-4444-8444-444444444444";
const TEEN = "55555555-5555-4555-8555-555555555555";

let household = "";
let child = "";
let teen = "";

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${KID}', 'anaya@example.test'), ('${TEEN}', 'rohan@example.test');`, options);
  let headMember = "";
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${KID}', 'Anaya'), ('${TEEN}', 'Rohan');`, options);
  // Anaya is six, Rohan fifteen.
  child = asProfile(HEAD, `select wh.create_child_member('${household}', 'Anaya', (current_date - interval '6 years 2 months')::date, array['${headMember}']::uuid[]);`, options);
  teen = asProfile(HEAD, `select wh.create_child_member('${household}', 'Rohan', (current_date - interval '15 years 2 months')::date, array['${headMember}']::uuid[]);`, options);
  psql(`update public.household_members set profile_id = '${KID}', gender = 'Female' where id = '${child}'; update public.household_members set profile_id = '${TEEN}', gender = 'male' where id = '${teen}';`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("the list is seeded, readable by members, and written by nobody from a session", () => {
  assert.ok(Number(asProfile(KID, `select count(*) from public.companion_sayings;`, options)) >= 150);
  assert.throws(() => asProfile(HEAD, `insert into public.companion_sayings (id, kind, min_age, max_age, words) values ('x-made-up', 'fact', 4, 17, '{"en":"Made up"}');`, options), /permission denied|row-level security/);
  asProfile(HEAD, `update public.companion_sayings set active = false;`, options);
  assert.equal(psql(`select count(*) from public.companion_sayings where not active;`, options), "0");
});

test("the cat picks only what suits the child's age and gender", () => {
  const young = asProfile(KID, `select string_agg(s.min_age || '-' || s.max_age || ':' || s.gender, ',') from public.companion_sayings_for('${child}', 20) f join public.companion_sayings s using (id);`, options).split(",");
  assert.equal(young.length, 20);
  for (const tag of young) {
    const [ages, gender] = tag.split(":");
    const [min, max] = ages.split("-").map(Number);
    assert.ok(min <= 6 && max >= 6, tag);
    assert.notEqual(gender, "boy", tag);
  }
  const older = asProfile(TEEN, `select string_agg(s.min_age || '-' || s.max_age || ':' || s.gender, ',') from public.companion_sayings_for('${teen}', 20) f join public.companion_sayings s using (id);`, options).split(",");
  for (const tag of older) {
    const [ages, gender] = tag.split(":");
    const [min, max] = ages.split("-").map(Number);
    assert.ok(min <= 15 && max >= 15, tag);
    assert.notEqual(gender, "girl", tag);
  }
});

test("a saying the child heard is never picked for them again", () => {
  const eligible = Number(psql(`select count(*) from public.companion_sayings where min_age <= 6 and max_age >= 6 and gender in ('any', 'girl');`, options));
  const first = asProfile(KID, `select id from public.companion_sayings_for('${child}', 1);`, options);
  asProfile(KID, `insert into public.companion_sayings_heard (household_id, member_id, saying_id) values ('${household}', '${child}', '${first}');`, options);
  const left = asProfile(KID, `select count(*) from (select public.companion_sayings_for('${child}', 20)) t;`, options);
  assert.ok(Number(left) > 0);
  assert.equal(asProfile(KID, `select count(*) from public.companion_sayings_for('${child}', 20) where id = '${first}';`, options), "0");
  // Hear every one: then there is nothing left to say, and nothing repeats.
  asProfile(KID, `insert into public.companion_sayings_heard (household_id, member_id, saying_id) select '${household}', '${child}', id from public.companion_sayings where min_age <= 6 and max_age >= 6 and gender in ('any', 'girl') on conflict do nothing;`, options);
  assert.equal(psql(`select count(*) from public.companion_sayings_heard where member_id = '${child}';`, options), String(eligible));
  assert.equal(asProfile(KID, `select count(*) from public.companion_sayings_for('${child}', 20);`, options), "0");
  // Rohan's list is untouched by what Anaya heard.
  assert.equal(asProfile(TEEN, `select count(*) from public.companion_sayings_for('${teen}', 20);`, options), "20");
});

test("a person records and reads only what they themselves heard", () => {
  assert.throws(
    () => asProfile(TEEN, `insert into public.companion_sayings_heard (household_id, member_id, saying_id) values ('${household}', '${child}', 'a-fact-001');`, options),
    /row-level security/,
  );
  assert.equal(asProfile(TEEN, `select count(*) from public.companion_sayings_heard;`, options), "0");
  assert.equal(asProfile(HEAD, `select count(*) from public.companion_sayings_heard;`, options), "0");
});
