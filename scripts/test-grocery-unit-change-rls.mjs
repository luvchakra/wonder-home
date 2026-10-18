#!/usr/bin/env node
/**
 * HomeFood 25-012: changing how an item is counted.
 *
 * Only adults change it. Pieces to grams cannot carry an amount across, so
 * what was at home goes back to not counted — kept on the change's own
 * record with what it had — and an open list entry reopens in grams at the
 * amount given. A unit that converts keeps every amount. The same request
 * again changes nothing twice, and another household cannot touch it.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_grocery_unit_test";
const options = { database: DB };

const OWNER = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let pasta = "";
let rice = "";

const json = (text) => JSON.parse(text);

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${OWNER}', 'owner@example.test'), ('${CHILD}', 'child@example.test'), ('${OUTSIDER}', 'outsider@example.test');`, options);
  household = asProfile(OWNER, `select household_id from wh.create_household('Sharma Home', 'Kunal');`, options);
  asProfile(OUTSIDER, `select wh.create_household('Other Home', 'Olu');`, options);
  psql(`insert into public.profiles (id, display_name) values ('${CHILD}', 'Asmi');`, options);
  const child = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${CHILD}', 'child', 'Asmi') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${child}', 'child');`, options);
  pasta = asProfile(OWNER, `insert into public.consumables (household_id, name, category, unit, step) values ('${household}', 'Pasta', 'grocery', 'pcs', 2) returning id;`, options);
  rice = asProfile(OWNER, `insert into public.consumables (household_id, name, category, unit, step) values ('${household}', 'Rice', 'grocery', 'g', 500) returning id;`, options);
  asProfile(OWNER, `select public.apply_inventory_change('${household}', '${pasta}', 'set', 3, 'pcs', 'stated', 'pasta-stock-0001');`, options);
  asProfile(OWNER, `select public.adjust_shopping_entry('${household}', '${pasta}', 'add', 1, 'pcs', 'manual', 'pasta-list-0001');`, options);
  asProfile(OWNER, `select public.apply_inventory_change('${household}', '${rice}', 'set', 2000, 'g', 'stated', 'rice-stock-0001');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

const change = (profile, item, unit, base, step, list, key) =>
  asProfile(profile, `select public.change_consumable_unit('${household}', '${item}', '${unit}', '${base}', ${step}, ${list}, '${key}');`, options);

test("a child cannot change how an item is counted", () => {
  assert.throws(() => change(CHILD, pasta, "g", "g", "null", 500, "unit-child-0001"), /only adults/);
  assert.equal(psql(`select unit from public.consumables where id = '${pasta}';`, options), "pcs");
});

test("pieces to grams: stock back to not counted, recorded; the list reopens in grams", () => {
  const result = json(change(OWNER, pasta, "g", "g", "null", 500, "unit-pasta-0001"));
  assert.equal(result.replayed, false);
  assert.equal(Number(result.stockCleared), 3);
  assert.equal(Number(result.listAfter), 500);
  assert.equal(psql(`select unit || ':' || coalesce(step::text, 'none') from public.consumables where id = '${pasta}';`, options), "g:none");
  assert.equal(psql(`select count(*) from public.inventory_balances where consumable_id = '${pasta}';`, options), "0");
  assert.equal(
    psql(`select from_unit || '>' || to_unit || ':' || stock_before::int || stock_unit || ':' || stock_cleared || ':' || list_before::int || '>' || list_after::int from public.consumable_unit_changes where consumable_id = '${pasta}';`, options),
    "pcs>g:3pcs:true:1>500",
  );
  assert.equal(psql(`select string_agg(state || ':' || quantity::int || ':' || unit, ',' order by created_at) from public.shopping_list_entries where consumable_id = '${pasta}';`, options), "removed:1:pcs,to_buy:500:g");
  // And the new entry is an ordinary one: grams add to it.
  assert.equal(json(asProfile(OWNER, `select public.adjust_shopping_entry('${household}', '${pasta}', 'add', 250, 'g', 'manual', 'pasta-list-0002');`, options)).after, 750);
});

test("the same request again changes nothing twice", () => {
  const again = json(change(OWNER, pasta, "g", "g", "null", 500, "unit-pasta-0001"));
  assert.equal(again.replayed, true);
  assert.equal(psql(`select count(*) from public.shopping_list_entries where consumable_id = '${pasta}';`, options), "2");
});

test("a unit that converts keeps every amount", () => {
  const result = json(change(OWNER, rice, "kg", "g", 0.5, "null", "unit-rice-0001"));
  assert.equal(result.stockCleared, null);
  assert.equal(psql(`select quantity::int || ':' || unit from public.inventory_balances where consumable_id = '${rice}';`, options), "2000:g");
  assert.equal(psql(`select unit || ':' || step from public.consumables where id = '${rice}';`, options), "kg:0.500");
});

test("members read the record of a change; nobody writes it from a session", () => {
  assert.equal(asProfile(CHILD, `select count(*) from public.consumable_unit_changes;`, options), "2");
  assert.throws(() => asProfile(OWNER, `insert into public.consumable_unit_changes (household_id, consumable_id, from_unit, to_unit, converts, idempotency_key) values ('${household}', '${rice}', 'g', 'pcs', false, 'forged-change-01');`, options), /permission denied/);
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.consumable_unit_changes;`, options), "0");
});

test("another household cannot change it, and nobody calls it signed out", () => {
  assert.throws(() => change(OUTSIDER, rice, "pcs", "pcs", "null", "null", "unit-outsider-01"), /only adults/);
  assert.equal(psql(`select unit from public.consumables where id = '${rice}';`, options), "kg");
  assert.equal(psql(`select has_function_privilege('anon', 'public.change_consumable_unit(uuid, uuid, text, text, numeric, numeric, text)', 'execute');`, options), "f");
});
