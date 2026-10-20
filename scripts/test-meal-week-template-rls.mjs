#!/usr/bin/env node
/**
 * The week template (the owner, 2026-10-20). Every member reads it; an adult
 * adds, changes and removes options and records a planned week; a child and
 * another household cannot write it, and another household reads nothing. A
 * meal WonderHome picked carries `origin = 'week_template'`.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_meal_week_template_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const CHILD = "44444444-4444-4444-8444-444444444444";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let recipe = "";
let outsiderHousehold = "";

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test'), ('${CHILD}', 'anya@example.test'), ('${OUTSIDER}', 'olu@example.test');`, options);
  [household] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya'), ('${CHILD}', 'Anya');`, options);
  const adultMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  const childMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${CHILD}', 'child', 'Anya') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${childMember}', 'child');`, options);
  recipe = asProfile(HEAD, `insert into public.recipes (household_id, name, active_minutes, total_minutes, serves) values ('${household}', 'Kanda poha', 15, 25, 4) returning id;`, options);
  outsiderHousehold = asProfile(OUTSIDER, `select household_id from wh.create_household('Other Home', 'Olu');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("an adult who is not an Admin adds, changes and removes an option", () => {
  const id = asProfile(ADULT, `insert into public.meal_week_template_options (household_id, weekday, slot, recipe_id) values ('${household}', 1, 'breakfast', '${recipe}') returning id;`, options);
  asProfile(ADULT, `update public.meal_week_template_options set weekday = 2 where id = '${id}';`, options);
  assert.equal(psql(`select weekday from public.meal_week_template_options where id = '${id}';`, options), "2");
  asProfile(ADULT, `delete from public.meal_week_template_options where id = '${id}';`, options);
  assert.equal(psql(`select count(*) from public.meal_week_template_options;`, options), "0");
});

test("a dish is listed once per day and meal", () => {
  asProfile(HEAD, `insert into public.meal_week_template_options (household_id, weekday, slot, recipe_id) values ('${household}', 3, 'dinner', '${recipe}');`, options);
  assert.throws(
    () => asProfile(HEAD, `insert into public.meal_week_template_options (household_id, weekday, slot, recipe_id) values ('${household}', 3, 'dinner', '${recipe}');`, options),
    /duplicate key/,
  );
});

test("a child reads the template but cannot write it or claim a week", () => {
  assert.equal(asProfile(CHILD, `select count(*) from public.meal_week_template_options;`, options), "1");
  assert.throws(
    () => asProfile(CHILD, `insert into public.meal_week_template_options (household_id, weekday, slot, recipe_id) values ('${household}', 4, 'lunch', '${recipe}');`, options),
    /row-level security/,
  );
  assert.throws(() => asProfile(CHILD, `insert into public.meal_week_plans (household_id, week_start) values ('${household}', '2026-10-19');`, options), /row-level security/);
});

test("an adult records a planned week once, on a Monday", () => {
  asProfile(ADULT, `insert into public.meal_week_plans (household_id, week_start, planned) values ('${household}', '2026-10-19', 5);`, options);
  assert.equal(asProfile(ADULT, `insert into public.meal_week_plans (household_id, week_start) values ('${household}', '2026-10-19') on conflict do nothing returning week_start;`, options), "");
  assert.throws(() => asProfile(ADULT, `insert into public.meal_week_plans (household_id, week_start) values ('${household}', '2026-10-21');`, options), /check constraint/);
});

test("a meal WonderHome picked says so; another household reads nothing and cannot use our recipe", () => {
  asProfile(ADULT, `insert into public.meals (household_id, name, slot, on_date, ready_by, recipe_id, origin) values ('${household}', 'Kanda poha', 'breakfast', '2026-10-22', '2026-10-22T03:00:00Z', '${recipe}', 'week_template');`, options);
  assert.equal(psql(`select origin from public.meals where on_date = '2026-10-22';`, options), "week_template");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.meal_week_template_options;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.meal_week_plans;`, options), "0");
  assert.throws(() =>
    asProfile(OUTSIDER, `insert into public.meal_week_template_options (household_id, weekday, slot, recipe_id) values ('${outsiderHousehold}', 1, 'lunch', '${recipe}');`, options),
  );
});
