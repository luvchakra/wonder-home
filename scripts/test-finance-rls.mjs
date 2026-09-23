#!/usr/bin/env node
/**
 * Bills and payments database tests (module 11).
 *
 * This module moves money, so the schema is asked to prove the dangerous things
 * are impossible rather than merely unlikely:
 *
 *   1. One successful transaction per approved intent, whatever a provider or a
 *      retry loop does. Double payment should be a database error, not a
 *      support conversation.
 *   2. Approval without step-up cannot reach a state that spends.
 *   3. A child cannot see the household's money at all.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_finance_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let otherHousehold = "";
let outsiderMember = "";
let obligation = "";
let intent = "";

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
  [otherHousehold, outsiderMember] = asProfile(
    OUTSIDER,
    `select household_id || ' ' || member_id from wh.create_household('Outsider Home', 'Outsider');`,
    options,
  ).split(" ");

  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya');`, options);
  const adultMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(
    `insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`,
    options,
  );

  obligation = asProfile(
    HEAD,
    `insert into public.obligations (household_id, name, kind, amount_minor, currency, due_on, status)
     values ('${household}', 'Electricity', 'utility', 284000, 'INR', current_date + 1, 'received')
     returning id;`,
    options,
  );

  intent = asProfile(
    HEAD,
    `insert into public.payment_intents (household_id, obligation_id, amount_minor, currency, idempotency_key)
     values ('${household}', '${obligation}', 284000, 'INR', 'household:electricity:284000')
     returning id;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("an amount always carries its currency", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.obligations (household_id, name, amount_minor) values ('${household}', 'Bare', 1000);`,
      options,
    ),
  );
});

test("a bill may exist before its amount does", () => {
  const id = asProfile(
    HEAD,
    `insert into public.obligations (household_id, name, due_on)
     values ('${household}', 'Next month''s electricity', current_date + 30) returning id;`,
    options,
  );

  assert.match(id, /^[0-9a-f-]{36}$/);
});

test("approval without step-up cannot reach a state that spends", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.payment_intents
         set status = 'approved', approved_at = now(), approved_by_member_id = '${headMember}'
       where id = '${intent}';`,
      options,
    ),
    "a payment was approved without anybody confirming again",
  );

  asProfile(
    HEAD,
    `update public.payment_intents
       set status = 'approved', approved_at = now(), approved_by_member_id = '${headMember}',
           step_up_verified_at = now()
     where id = '${intent}';`,
    options,
  );

  assert.equal(psql(`select status from public.payment_intents where id = '${intent}';`, options), "approved");
});

test("an approval has to name who gave it", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.payment_intents set approved_by_member_id = null where id = '${intent}';`,
      options,
    ),
  );
});

test("execution cannot happen without an approval", () => {
  const fresh = asProfile(
    HEAD,
    `insert into public.payment_intents (household_id, obligation_id, amount_minor, currency, idempotency_key)
     values ('${household}', '${obligation}', 100000, 'INR', 'unapproved-key') returning id;`,
    options,
  );

  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.payment_intents set status = 'executing', step_up_verified_at = now() where id = '${fresh}';`,
      options,
    ),
  );
});

test("one successful transaction per intent, whatever a retry loop does", () => {
  psql(
    `insert into public.payment_attempts (household_id, payment_intent_id, attempt_number, provider, status)
     values ('${household}', '${intent}', 1, 'fixture_payments', 'succeeded');`,
    options,
  );

  let doubled = false;
  try {
    psql(
      `insert into public.payment_attempts (household_id, payment_intent_id, attempt_number, provider, status)
       values ('${household}', '${intent}', 2, 'fixture_payments', 'succeeded');`,
      options,
    );
    doubled = true;
  } catch {
    doubled = false;
  }

  assert.equal(doubled, false, "the same bill was paid twice");
});

test("a failed attempt is allowed alongside the successful one, and has to say why", () => {
  psql(
    `insert into public.payment_attempts (household_id, payment_intent_id, attempt_number, provider, status, failure_code)
     values ('${household}', '${intent}', 3, 'fixture_payments', 'failed', 'timeout');`,
    options,
  );

  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.payment_attempts (household_id, payment_intent_id, attempt_number, provider, status)
       values ('${household}', '${intent}', 4, 'fixture_payments', 'failed');`,
      options,
    ),
    "an attempt failed with no reason recorded",
  );
});

test("the same idempotency key cannot be used twice in one household", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.payment_intents (household_id, obligation_id, amount_minor, currency, idempotency_key)
       values ('${household}', '${obligation}', 284000, 'INR', 'household:electricity:284000');`,
      options,
    ),
  );
});

test("a member cannot write a payment attempt and claim money moved", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.payment_attempts (household_id, payment_intent_id, attempt_number, provider, status)
       values ('${household}', '${intent}', 9, 'fixture_payments', 'succeeded');`,
      options,
    ),
  );
});

test("an ordinary adult sees the bills but cannot pay them", () => {
  assert.equal(
    asProfile(ADULT, `select count(*) from public.obligations;`, options),
    "2",
    "an adult should be able to see what the household owes",
  );

  assert.ok(
    deniedForProfile(
      ADULT,
      `insert into public.payment_intents (household_id, obligation_id, amount_minor, currency, idempotency_key)
       values ('${household}', '${obligation}', 1000, 'INR', 'adult-key');`,
      options,
    ),
  );
});

test("a child sees none of the household's money", () => {
  const childProfile = "44444444-4444-4444-8444-444444444444";
  psql(`insert into auth.users (id, email) values ('${childProfile}', 'aarav@example.test');`, options);
  psql(`insert into public.profiles (id, display_name) values ('${childProfile}', 'Aarav');`, options);

  const childMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${childProfile}', 'child', 'Aarav') returning id;`,
    options,
  );
  psql(
    `insert into public.household_roles (household_id, member_id, role) values ('${household}', '${childMember}', 'child');`,
    options,
  );

  assert.equal(
    asProfile(childProfile, `select count(*) from public.obligations;`, options),
    "0",
    "a child could see the household's bills",
  );
  assert.equal(asProfile(childProfile, `select count(*) from public.payment_intents;`, options), "0");
  assert.equal(asProfile(childProfile, `select count(*) from public.budgets;`, options), "0");
});

test("an anomaly review has to name the reviewer", () => {
  psql(
    `insert into public.spend_anomalies
       (household_id, obligation_id, amount_minor, currency, baseline_minor, baseline_label, ratio)
     values ('${household}', '${obligation}', 890000, 'INR', 285000, 'usual over 3 periods', 3.12);`,
    options,
  );

  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.spend_anomalies set status = 'accepted', reviewed_at = now()
       where obligation_id = '${obligation}';`,
      options,
    ),
    "an anomaly was reviewed with nobody's name on the decision",
  );
});

test("an anomaly never blocks the payment it concerns", () => {
  // The intent stays approved and executable while an open anomaly exists: a
  // bill that is genuinely three times the usual is the one most worth paying.
  assert.equal(
    psql(`select status from public.payment_intents where id = '${intent}';`, options),
    "approved",
  );
  assert.equal(
    psql(`select count(*) from public.spend_anomalies where status = 'open';`, options),
    "1",
  );
});

test("a recorded transaction can name its own payee, kind and owner", () => {
  asProfile(
    HEAD,
    `insert into public.obligation_history (household_id, obligation_id, period_label, amount_minor, currency, payee, kind, owner_member_id)
     values ('${household}', '${obligation}', '2026-08', 281000, 'INR', 'BESCOM collection agent', 'Utility', '${headMember}');`,
    options,
  );
  assert.equal(
    psql(`select payee || '|' || kind || '|' || owner_member_id from public.obligation_history where period_label = '2026-08';`, options),
    `BESCOM collection agent|Utility|${headMember}`,
  );
});

test("a transaction's owner has to belong to the same household", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.obligation_history (household_id, obligation_id, period_label, amount_minor, currency, owner_member_id)
       values ('${household}', '${obligation}', '2026-07', 280000, 'INR', '${outsiderMember}');`,
      options,
    ),
  );
  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.obligation_history set owner_member_id = '${outsiderMember}' where period_label = '2026-08';`,
      options,
    ),
  );
});

test("another household's finances are completely invisible", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.obligations;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.payment_intents;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.payment_attempts;`, options), "0");
});

test("no column in this module can hold a payment secret", () => {
  // A structural check rather than a behavioural one: the schema should have no
  // place a card number or a bank credential could be put.
  const suspicious = psql(
    `select string_agg(table_name || '.' || column_name, ', ')
     from information_schema.columns
     where table_schema = 'public'
       and table_name in ('obligations', 'payment_intents', 'payment_attempts', 'spend_anomalies', 'budgets')
       and (
         column_name ~* '(card|cvv|pan|account_number|iban|secret|token|password)'
       );`,
    options,
  );

  assert.equal(suspicious, "", `columns that could hold a payment secret: ${suspicious}`);
});
