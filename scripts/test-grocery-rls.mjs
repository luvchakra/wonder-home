#!/usr/bin/env node
/**
 * Groceries Phase 1: stock and the shopping list.
 *
 * Members read both; nobody writes either table from a session — only the
 * three functions do. Adults change stock; adults and children change the
 * list; helpers read. Amounts never go below zero, the same item is never
 * two open entries, a retry with the same key changes nothing twice, a stale
 * version is refused, and another household sees none of it.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_grocery_test";
const options = { database: DB };

const OWNER = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const HELPER = "44444444-4444-4444-8444-444444444444";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let eggs = "";

function member(profile, name, type) {
  psql(
    `insert into public.profiles (id, display_name) values ('${profile}', '${name}');`,
    options,
  );
  const id = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${profile}', '${type}', '${name}') returning id;`,
    options,
  );
  psql(
    `insert into public.household_roles (household_id, member_id, role) values ('${household}', '${id}', '${type}');`,
    options,
  );
}

const json = (text) => JSON.parse(text);

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${OWNER}', 'owner@example.test'), ('${CHILD}', 'child@example.test'), ('${HELPER}', 'helper@example.test'), ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );
  household = asProfile(
    OWNER,
    `select household_id from wh.create_household('Sharma Home', 'Kunal');`,
    options,
  );
  asProfile(
    OUTSIDER,
    `select wh.create_household('Other Home', 'Olu');`,
    options,
  );
  member(CHILD, "Asmi", "child");
  member(HELPER, "Rita", "helper");
  eggs = asProfile(
    OWNER,
    `insert into public.consumables (household_id, name, category, unit) values ('${household}', 'Eggs', 'grocery', 'pcs') returning id;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

const stock = (profile, kind, quantity, key, version = "null") =>
  asProfile(
    profile,
    `select public.apply_inventory_change('${household}', '${eggs}', '${kind}', ${quantity}, 'pcs', 'stated', '${key}', ${version});`,
    options,
  );
const list = (profile, kind, quantity, key) =>
  asProfile(
    profile,
    `select public.adjust_shopping_entry('${household}', '${eggs}', '${kind}', ${quantity}, 'pcs', 'manual', '${key}');`,
    options,
  );

test("an adult sets what is at home; a retry with the same key changes nothing twice", () => {
  assert.equal(json(stock(OWNER, "set", 10, "stock-set-0001")).after, 10);
  assert.equal(json(stock(OWNER, "add", 2, "stock-add-0001")).after, 12);
  assert.equal(json(stock(OWNER, "add", 2, "stock-add-0001")).replayed, true);
  assert.equal(
    psql(
      `select quantity::int from public.inventory_balances where consumable_id = '${eggs}';`,
      options,
    ),
    "12",
  );
});

test("using more than is there stops at zero and says so", () => {
  const used = json(stock(OWNER, "use", 20, "stock-use-0001"));
  assert.equal(used.after, 0);
  assert.equal(used.clamped, true);
});

test("a stale version is refused, not overwritten", () => {
  const current = Number(
    psql(
      `select version from public.inventory_balances where consumable_id = '${eggs}';`,
      options,
    ),
  );
  const refused = json(stock(OWNER, "set", 5, "stock-set-0002", current - 1));
  assert.equal(refused.conflict, true);
  assert.equal(
    psql(
      `select quantity::int from public.inventory_balances where consumable_id = '${eggs}';`,
      options,
    ),
    "0",
  );
});

test("a child and a helper cannot change stock", () => {
  assert.ok(
    deniedForProfile(
      CHILD,
      `select public.apply_inventory_change('${household}', '${eggs}', 'set', 3, 'pcs', 'stated', 'stock-child-01');`,
      options,
    ),
  );
  assert.ok(
    deniedForProfile(
      HELPER,
      `select public.apply_inventory_change('${household}', '${eggs}', 'set', 3, 'pcs', 'stated', 'stock-help-01');`,
      options,
    ),
  );
});

test("adding the same item twice combines into one entry; a child may add, a helper may not", () => {
  assert.equal(json(list(OWNER, "add", 6, "list-add-0001")).after, 6);
  assert.equal(json(list(CHILD, "add", 6, "list-add-0002")).after, 12);
  assert.equal(
    psql(
      `select count(*) from public.shopping_list_entries where consumable_id = '${eggs}' and state = 'to_buy';`,
      options,
    ),
    "1",
  );
  assert.ok(
    deniedForProfile(
      HELPER,
      `select public.adjust_shopping_entry('${household}', '${eggs}', 'add', 1, 'pcs', 'manual', 'list-help-0001');`,
      options,
    ),
  );
});

test("taking off more than is listed stops at zero and closes the entry", () => {
  assert.equal(json(list(OWNER, "subtract", 50, "list-sub-0001")).after, 0);
  assert.equal(
    psql(
      `select count(*) from public.shopping_list_entries where consumable_id = '${eggs}' and state = 'to_buy';`,
      options,
    ),
    "0",
  );
});

test("a unit that does not match the item's entry is refused", () => {
  list(OWNER, "add", 6, "list-add-0003");
  assert.ok(
    deniedForProfile(
      OWNER,
      `select public.adjust_shopping_entry('${household}', '${eggs}', 'add', 1, 'g', 'manual', 'list-unit-0001');`,
      options,
    ),
  );
});

test("buying part of the list records a purchase, adds to stock, and leaves the rest to buy", () => {
  const entry = psql(
    `select id from public.shopping_list_entries where consumable_id = '${eggs}' and state = 'to_buy';`,
    options,
  );
  const bought = json(
    asProfile(
      OWNER,
      `select public.mark_bought('${household}', '${entry}', 4, current_date, 'bought-00001');`,
      options,
    ),
  );
  assert.equal(bought.remaining, 2);
  assert.equal(bought.stockAfter, 4);
  assert.equal(
    psql(
      `select count(*) from public.consumable_purchases where consumable_id = '${eggs}';`,
      options,
    ),
    "1",
  );
  const again = json(
    asProfile(
      OWNER,
      `select public.mark_bought('${household}', '${entry}', 4, current_date, 'bought-00001');`,
      options,
    ),
  );
  assert.equal(again.replayed, true);
  assert.equal(
    psql(
      `select count(*) from public.consumable_purchases where consumable_id = '${eggs}';`,
      options,
    ),
    "1",
  );
  assert.equal(
    psql(
      `select quantity::int from public.inventory_balances where consumable_id = '${eggs}';`,
      options,
    ),
    "4",
  );
});

test("nobody writes the tables directly; another household sees nothing", () => {
  assert.ok(
    deniedForProfile(
      OWNER,
      `insert into public.inventory_balances (household_id, consumable_id, quantity, unit, source) values ('${household}', '${eggs}', 1, 'pcs', 'stated');`,
      options,
    ),
  );
  assert.ok(
    deniedForProfile(
      OWNER,
      `update public.shopping_list_entries set quantity = 99;`,
      options,
    ) ||
      asProfile(
        OWNER,
        `select count(*) from public.shopping_list_entries where quantity = 99;`,
        options,
      ) === "0",
  );
  assert.equal(
    asProfile(
      OUTSIDER,
      `select count(*) from public.inventory_balances;`,
      options,
    ),
    "0",
  );
  assert.equal(
    asProfile(
      OUTSIDER,
      `select count(*) from public.shopping_list_entries;`,
      options,
    ),
    "0",
  );
  assert.ok(
    deniedForProfile(
      OUTSIDER,
      `select public.adjust_shopping_entry('${household}', '${eggs}', 'add', 1, 'pcs', 'manual', 'list-out-00001');`,
      options,
    ),
  );
  assert.equal(
    asProfile(
      HELPER,
      `select count(*) from public.shopping_list_entries where state = 'to_buy';`,
      options,
    ),
    "1",
  );
});

test("groceries is part of every plan", () => {
  assert.equal(
    psql(
      `select count(*) from public.plans p where not exists (select 1 from public.plan_features f where f.plan_key = p.key and f.feature_key = 'groceries.core' and f.enabled);`,
      options,
    ),
    "0",
  );
});

test("a use-by date needs an amount at home, and only an adult sets it", () => {
  const milk = asProfile(
    OWNER,
    `insert into public.consumables (household_id, name, category, unit) values ('${household}', 'Milk', 'grocery', 'l') returning id;`,
    options,
  );
  assert.equal(
    asProfile(
      OWNER,
      `select public.set_inventory_use_by('${household}', '${milk}', current_date + 3);`,
      options,
    ),
    "f",
  );
  assert.equal(
    asProfile(
      OWNER,
      `select public.set_inventory_use_by('${household}', '${eggs}', current_date + 3);`,
      options,
    ),
    "t",
  );
  assert.equal(
    psql(
      `select use_by_basis from public.inventory_balances where consumable_id = '${eggs}';`,
      options,
    ),
    "entered",
  );
  assert.ok(
    deniedForProfile(
      CHILD,
      `select public.set_inventory_use_by('${household}', '${eggs}', null);`,
      options,
    ),
  );
});
