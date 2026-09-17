#!/usr/bin/env node
/**
 * Commerce and consumables database tests (module 09).
 *
 * Two rules are worth proving against a real Postgres rather than in a unit
 * test, because both are enforced by the schema and could be lost in a
 * migration without any TypeScript noticing:
 *
 *   1. A prediction cannot exist without its evidence. The constraint, not the
 *      application, is what stops a guess becoming a shopping action.
 *   2. Spending is narrower than the shopping list. Anyone who lives here can
 *      say the milk is running out; not everyone can place an order.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_commerce_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let otherHousehold = "";
let consumable = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'),
       ('${ADULT}', 'adult@example.test'),
       ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );

  [household] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");
  [otherHousehold] = asProfile(
    OUTSIDER,
    `select household_id || ' ' || member_id from wh.create_household('Outsider Home', 'Outsider');`,
    options,
  ).split(" ");

  // An ordinary adult: a member of the household, not an administrator.
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'An adult');`, options);
  psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${ADULT}', 'adult', 'An adult');`,
    options,
  );

  consumable = asProfile(
    HEAD,
    `insert into public.consumables (household_id, name, category, days_per_unit, evidence_basis, last_purchased_on)
     values ('${household}', 'Milk', 'grocery', 2, 'purchase_history', current_date - 3)
     returning id;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a consumption rate cannot exist without evidence behind it", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.consumables (household_id, name, days_per_unit)
       values ('${household}', 'Unfounded', 3);`,
      options,
    ),
    "a rate was accepted with no basis, so a guess could become a shopping action",
  );

  // The other direction too: evidence with nothing it is evidence for.
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.consumables (household_id, name, evidence_basis)
       values ('${household}', 'Also unfounded', 'purchase_history');`,
      options,
    ),
  );
});

test("a consumable with no rate is perfectly legal — not knowing is honest", () => {
  const id = asProfile(
    HEAD,
    `insert into public.consumables (household_id, name) values ('${household}', 'Something new') returning id;`,
    options,
  );

  assert.match(id, /^[0-9a-f-]{36}$/);
});

test("a pet supply has to belong to the pet category", () => {
  const pet = asProfile(
    HEAD,
    `insert into public.pets (household_id, name, species) values ('${household}', 'Mochi', 'cat') returning id;`,
    options,
  );

  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.consumables (household_id, name, category, pet_id)
       values ('${household}', 'Cat food', 'grocery', '${pet}');`,
      options,
    ),
  );

  const ok = asProfile(
    HEAD,
    `insert into public.consumables (household_id, name, category, pet_id)
     values ('${household}', 'Cat food', 'pet', '${pet}') returning id;`,
    options,
  );
  assert.match(ok, /^[0-9a-f-]{36}$/);
});

test("a consumable cannot point at another household's pet", () => {
  const theirPet = asProfile(
    OUTSIDER,
    `insert into public.pets (household_id, name, species) values ('${otherHousehold}', 'Bruno', 'dog') returning id;`,
    options,
  );

  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.consumables (household_id, name, category, pet_id)
       values ('${household}', 'Their dog food', 'pet', '${theirPet}');`,
      options,
    ),
  );
});

test("a suggestion has to say why it is there", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.cart_suggestions (household_id, consumable_id, quantity, evidence_basis)
       values ('${household}', '${consumable}', 2, 'purchase_history');`,
      options,
    ),
    "a suggestion was accepted with no reason a household could read",
  );
});

test("anyone in the household can keep the shopping list", () => {
  asProfile(
    ADULT,
    `insert into public.cart_suggestions (household_id, consumable_id, quantity, reason, evidence_basis)
     values ('${household}', '${consumable}', 2, 'We are nearly out of milk.', 'member_stated');`,
    options,
  );

  assert.equal(asProfile(ADULT, `select count(*) from public.cart_suggestions;`, options), "1");
});

test("not everyone in the household can spend money", () => {
  assert.ok(
    deniedForProfile(
      ADULT,
      `insert into public.orders (household_id, provider, total_minor)
       values ('${household}', 'bigbasket', 184000);`,
      options,
    ),
    "an ordinary member placed an order",
  );

  const orderId = asProfile(
    HEAD,
    `insert into public.orders (household_id, provider, total_minor, idempotency_key)
     values ('${household}', 'bigbasket', 184000, 'key-1') returning id;`,
    options,
  );

  // They can still see what the household spent — visibility is not the limit.
  assert.equal(asProfile(ADULT, `select count(*) from public.orders;`, options), "1");
  assert.match(orderId, /^[0-9a-f-]{36}$/);
});

test("the same order cannot be placed twice", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.orders (household_id, provider, total_minor, idempotency_key)
       values ('${household}', 'bigbasket', 184000, 'key-1');`,
      options,
    ),
    "a retry bought the groceries a second time",
  );
});

test("an approval has to name the person who gave it", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.orders set approved_at = now() where idempotency_key = 'key-1';`,
      options,
    ),
    "an order recorded an approval that nobody signed",
  );
});

test("an order that spent money has to say when it was placed", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.orders set status = 'placed' where idempotency_key = 'key-1';`,
      options,
    ),
  );
});

test("a failure has to say what failed", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.orders set status = 'failed' where idempotency_key = 'key-1';`,
      options,
    ),
  );
});

test("a household's shopping is invisible to every other household", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.consumables;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.cart_suggestions;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.orders;`, options), "0");
});

test("a member cannot invent a merchant's price", () => {
  // A member who could write an offer could make anything look like the
  // cheapest option, which is the one input the comparison trusts completely.
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.merchant_offers (household_id, consumable_id, provider, price_minor, currency)
       values ('${household}', '${consumable}', 'bigbasket', 1, 'INR');`,
      options,
    ),
  );
});

test("only an administrator sets what may be bought without asking", () => {
  assert.ok(
    deniedForProfile(
      ADULT,
      `insert into public.purchase_policies (household_id, scope, auto_approve_under_minor)
       values ('${household}', 'any', 999999999);`,
      options,
    ),
  );

  asProfile(
    HEAD,
    `insert into public.purchase_policies (household_id, scope, auto_approve_under_minor, hard_limit_minor)
     values ('${household}', 'any', 200000, 1000000);`,
    options,
  );

  assert.equal(asProfile(ADULT, `select count(*) from public.purchase_policies;`, options), "1");
});

test("an automatic limit cannot exceed the household's own ceiling", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.purchase_policies (household_id, scope, scope_value, auto_approve_under_minor, hard_limit_minor)
       values ('${household}', 'category', 'grocery', 5000000, 1000000);`,
      options,
    ),
  );
});
