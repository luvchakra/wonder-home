#!/usr/bin/env node
/**
 * Meals and cooking database tests (module 10).
 *
 * The schema carries three rules that no amount of application care can
 * substitute for, so they are checked against a real Postgres:
 *
 *   1. Readiness has to say how it was established. A meal cannot be "ready"
 *      because something forgot to record who said so.
 *   2. A preference about another person is not yours to record. "Priya does
 *      not like fish" is Priya's to say.
 *   3. One meal per slot per day, so two people planning dinner produce a
 *      conflict rather than two dinners.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_meals_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let adultMember = "";
let otherHousehold = "";
let recipe = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'),
       ('${ADULT}', 'priya@example.test'),
       ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");
  [otherHousehold] = asProfile(
    OUTSIDER,
    `select household_id || ' ' || member_id from wh.create_household('Outsider Home', 'Outsider');`,
    options,
  ).split(" ");

  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya');`, options);
  adultMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`,
    options,
  );

  recipe = asProfile(
    HEAD,
    `insert into public.recipes (household_id, name, active_minutes, total_minutes)
     values ('${household}', 'Paneer pulao', 20, 45) returning id;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a recipe's total time cannot be shorter than its hands-on time", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.recipes (household_id, name, active_minutes, total_minutes)
       values ('${household}', 'Impossible', 60, 30);`,
      options,
    ),
  );
});

test("one meal per slot per day", () => {
  asProfile(
    HEAD,
    `insert into public.meals (household_id, name, slot, on_date, ready_by, recipe_id)
     values ('${household}', 'Paneer pulao', 'dinner', current_date, now() + interval '3 hours', '${recipe}');`,
    options,
  );

  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.meals (household_id, name, slot, on_date, ready_by)
       values ('${household}', 'Something else', 'dinner', current_date, now() + interval '4 hours');`,
      options,
    ),
    "two dinners were planned for the same evening",
  );
});

test("readiness has to say how it was established", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.meals set ready_at = now() where household_id = '${household}';`,
      options,
    ),
    "a meal became ready with no record of who or what said so",
  );

  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.meals set status = 'ready' where household_id = '${household}';`,
      options,
    ),
    "a meal was marked ready without a time",
  );

  asProfile(
    HEAD,
    `update public.meals
       set status = 'ready', ready_at = now(), readiness_source = 'member_confirmed'
     where household_id = '${household}';`,
    options,
  );

  assert.equal(
    psql(`select readiness_source from public.meals where household_id = '${household}';`, options),
    "member_confirmed",
  );
});

test("a member may record their own preference and the household's", () => {
  asProfile(
    ADULT,
    `insert into public.food_preferences (household_id, member_id, kind, subject)
     values ('${household}', '${adultMember}', 'dislike', 'mushroom');`,
    options,
  );

  asProfile(
    ADULT,
    `insert into public.food_preferences (household_id, kind, subject)
     values ('${household}', 'ethical', 'beef');`,
    options,
  );

  assert.equal(asProfile(ADULT, `select count(*) from public.food_preferences;`, options), "2");
});

test("a member may not record a preference on somebody else's behalf", () => {
  assert.ok(
    deniedForProfile(
      ADULT,
      `insert into public.food_preferences (household_id, member_id, kind, subject)
       values ('${household}', '${headMember}', 'dislike', 'fish');`,
      options,
    ),
    "one member spoke for another's tastes",
  );
});

test("an administrator can record a preference for a child who cannot", () => {
  const child = asProfile(
    HEAD,
    `select wh.create_child_member('${household}', 'Aarav', '2016-04-01'::date, array['${headMember}']::uuid[]);`,
    options,
  );

  asProfile(
    HEAD,
    `insert into public.food_preferences (household_id, member_id, kind, subject)
     values ('${household}', '${child}', 'allergy', 'peanut');`,
    options,
  );

  assert.equal(
    psql(`select kind from public.food_preferences where member_id = '${child}';`, options),
    "allergy",
  );
});

test("a substitution has to name what was used instead", () => {
  const meal = psql(`select id from public.meals where household_id = '${household}';`, options);

  asProfile(
    HEAD,
    `insert into public.meal_ingredient_needs (household_id, meal_id, name, quantity)
     values ('${household}', '${meal}', 'Paneer', 200);`,
    options,
  );

  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.meal_ingredient_needs set status = 'substituted' where meal_id = '${meal}';`,
      options,
    ),
    "an ingredient was substituted with no record of what replaced it",
  );
});

test("a meal cannot use another household's recipe", () => {
  const theirRecipe = asProfile(
    OUTSIDER,
    `insert into public.recipes (household_id, name) values ('${otherHousehold}', 'Their dish') returning id;`,
    options,
  );

  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.meals (household_id, name, slot, on_date, ready_by, recipe_id)
       values ('${household}', 'Borrowed', 'lunch', current_date + 1, now() + interval '1 day', '${theirRecipe}');`,
      options,
    ),
  );
});

test("a household's meals and preferences are invisible to everyone else", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.meals;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.food_preferences;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.recipes;`, options), "1", "their own only");
});

test("a shortage points at the shopping suggestion that resolves it", () => {
  const consumable = asProfile(
    HEAD,
    `insert into public.consumables (household_id, name) values ('${household}', 'Paneer') returning id;`,
    options,
  );
  const suggestion = asProfile(
    HEAD,
    `insert into public.cart_suggestions (household_id, consumable_id, quantity, reason, evidence_basis)
     values ('${household}', '${consumable}', 200, 'Needed for dinner.', 'member_stated') returning id;`,
    options,
  );
  const meal = psql(`select id from public.meals where household_id = '${household}';`, options);

  asProfile(
    HEAD,
    `update public.meal_ingredient_needs
       set status = 'shopping', cart_suggestion_id = '${suggestion}'
     where meal_id = '${meal}' and name = 'Paneer';`,
    options,
  );

  assert.equal(
    psql(
      `select count(*) from public.meal_ingredient_needs
       where cart_suggestion_id is not null and meal_id = '${meal}';`,
      options,
    ),
    "1",
    "a shortage stayed an informational note instead of becoming a shopping dependency",
  );
});
