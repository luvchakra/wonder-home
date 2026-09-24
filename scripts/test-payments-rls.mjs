#!/usr/bin/env node
/**
 * Payments across providers (story 20-009): the catalogue and the ledger.
 *
 * What a plan costs is readable by anyone signed in; which provider plan backs
 * a price is the server's alone. What a provider reported — payments,
 * invoices, refunds, the customer — is an Admin's to read and nobody's to
 * write but the server's. The constraints are the other half: money in major
 * units, a provider's code and never its prose, a card's last four and never
 * more, and a refund that is only "succeeded" with the time it completed.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_payments_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const OUTSIDER = "22222222-2222-4222-8222-222222222222";
const ADULT = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let price = "";
let payment = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'), ('${OUTSIDER}', 'outsider@example.test'),
       ('${ADULT}', 'priya@example.test');`,
    options,
  );
  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");
  asProfile(OUTSIDER, `select wh.create_household('Outsider Home', 'Outsider');`, options);
  // A member with no role: in the household, but not an Admin.
  psql(
    `insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya') on conflict (id) do nothing;
     insert into public.household_members (household_id, profile_id, member_type, display_name, status)
     values ('${household}', '${ADULT}', 'adult', 'Priya', 'active');`,
    options,
  );

  // Test fixtures only: the real catalogue ships empty until a person prices it.
  price = psql(
    `insert into public.plan_prices (plan_key, billing_interval, currency, amount)
     values ('pro', 'month', 'INR', 299.00) returning id;`,
    options,
  );
  psql(
    `insert into public.payment_provider_plans (plan_price_id, provider, provider_plan_ref)
     values ('${price}', 'razorpay', 'plan_test_pro_month');`,
    options,
  );
  payment = psql(
    `insert into public.payments (household_id, provider, provider_payment_id, plan_key, amount, currency, status, method, method_last4)
     values ('${household}', 'razorpay', 'pay_test_1', 'pro', 299.00, 'INR', 'succeeded', 'card', '4242') returning id;`,
    options,
  );
  psql(
    `insert into public.billing_invoices (household_id, provider, provider_invoice_id, payment_id, amount, currency, status, issued_at)
     values ('${household}', 'razorpay', 'inv_test_1', '${payment}', 299.00, 'INR', 'paid', now());
     insert into public.payment_customers (household_id, provider, provider_customer_id)
     values ('${household}', 'razorpay', 'cust_test_1');
     insert into public.payment_refunds (household_id, payment_id, provider, amount, currency)
     values ('${household}', '${payment}', 'razorpay', 100.00, 'INR');`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("the catalogue ships with no prices: what a plan costs is a person's decision", () => {
  const fresh = "wonderhome_payments_fresh_test";
  buildTestDatabase(fresh);
  try {
    assert.equal(psql(`select count(*) from public.plan_prices;`, { database: fresh }), "0");
    assert.equal(psql(`select count(*) from public.payment_provider_plans;`, { database: fresh }), "0");
    assert.equal(psql(`select count(*) from public.plans where requires_payment;`, { database: fresh }), "0");
  } finally {
    psql(`drop database if exists ${fresh}`, { database: "postgres" });
  }
});

test("anyone signed in reads an active price, and nobody but the server writes one", () => {
  assert.equal(asProfile(ADULT, `select amount from public.plan_prices where id = '${price}';`, options), "299.00");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.plan_prices;`, options), "1");
  assert.ok(
    deniedForProfile(HEAD, `insert into public.plan_prices (plan_key, billing_interval, currency, amount) values ('max', 'month', 'INR', 1);`, options),
    "an Admin priced a plan",
  );
  assert.ok(
    deniedForUpdate(HEAD, `update public.plan_prices set amount = 1 where id = '${price}';`, `select amount from public.plan_prices where id = '${price}';`, "299.00", options),
    "an Admin changed a price",
  );
  // A retired price is not offered.
  psql(`update public.plan_prices set active = false where id = '${price}';`, options);
  assert.equal(asProfile(HEAD, `select count(*) from public.plan_prices;`, options), "0");
  psql(`update public.plan_prices set active = true where id = '${price}';`, options);
});

test("a price is one per plan, interval and currency, in major units", () => {
  assert.throws(
    () => psql(`insert into public.plan_prices (plan_key, billing_interval, currency, amount) values ('pro', 'month', 'INR', 399);`, options),
    "two active prices for the same plan, interval and currency",
  );
  assert.throws(() => psql(`insert into public.plan_prices (plan_key, billing_interval, currency, amount) values ('pro', 'week', 'INR', 1);`, options));
  assert.throws(() => psql(`insert into public.plan_prices (plan_key, billing_interval, currency, amount) values ('pro', 'year', 'inr', 1);`, options));
  assert.throws(() => psql(`insert into public.plan_prices (plan_key, billing_interval, currency, amount) values ('pro', 'year', 'INR', -1);`, options));
  // numeric(12,2): an amount is kept to the paisa, never as a count of paise.
  psql(`insert into public.plan_prices (plan_key, billing_interval, currency, amount) values ('pro', 'year', 'USD', 29.999);`, options);
  assert.equal(psql(`select amount from public.plan_prices where currency = 'USD';`, options), "30.00");
});

test("which provider plan backs a price is never visible to a household", () => {
  assert.equal(psql(`select count(*) from public.payment_provider_plans;`, options), "1");
  for (const profile of [HEAD, ADULT, OUTSIDER]) {
    assert.equal(asProfile(profile, `select count(*) from public.payment_provider_plans;`, options), "0");
  }
  assert.ok(
    deniedForProfile(HEAD, `insert into public.payment_provider_plans (plan_price_id, provider, provider_plan_ref) values ('${price}', 'stripe', 'price_forged');`, options),
    "a household mapped a price to a provider plan",
  );
  assert.throws(
    () => psql(`insert into public.payment_provider_plans (plan_price_id, provider, provider_plan_ref) values ('${price}', 'razorpay', 'plan_other');`, options),
    "two active provider plans for one price and provider",
  );
  assert.throws(() => psql(`insert into public.payment_provider_plans (plan_price_id, provider, provider_plan_ref) values ('${price}', 'paypal', 'x');`, options));
});

test("the ledger is an Admin's to read, and only in their own household", () => {
  for (const table of ["payments", "billing_invoices", "payment_refunds", "payment_customers"]) {
    assert.equal(asProfile(HEAD, `select count(*) from public.${table};`, options), "1", `${table}: the Admin cannot read it`);
    assert.equal(asProfile(ADULT, `select count(*) from public.${table};`, options), "0", `${table}: a member without a role reads it`);
    assert.equal(asProfile(OUTSIDER, `select count(*) from public.${table};`, options), "0", `${table}: another household reads it`);
  }
});

test("nobody writes the ledger but the server, not even an Admin", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.payments (household_id, provider, provider_payment_id, amount, currency, status) values ('${household}', 'razorpay', 'pay_forged', 299, 'INR', 'succeeded');`,
      options,
    ),
    "an Admin recorded a payment",
  );
  assert.ok(
    deniedForUpdate(HEAD, `update public.payments set status = 'refunded' where id = '${payment}';`, `select status from public.payments where id = '${payment}';`, "succeeded", options),
    "an Admin moved a payment",
  );
  assert.ok(
    deniedForUpdate(HEAD, `delete from public.payments where id = '${payment}';`, `select count(*) from public.payments where id = '${payment}';`, "1", options),
    "an Admin deleted a payment",
  );
  assert.ok(
    deniedForProfile(HEAD, `insert into public.payment_refunds (household_id, payment_id, provider, amount, currency) values ('${household}', '${payment}', 'razorpay', 1, 'INR');`, options),
    "an Admin recorded a refund",
  );
  assert.ok(
    deniedForProfile(HEAD, `insert into public.billing_invoices (household_id, provider, provider_invoice_id, amount, currency, status, issued_at) values ('${household}', 'razorpay', 'inv_forged', 1, 'INR', 'paid', now());`, options),
    "an Admin issued an invoice",
  );
  assert.ok(
    deniedForProfile(HEAD, `insert into public.payment_customers (household_id, provider, provider_customer_id) values ('${household}', 'stripe', 'cus_forged');`, options),
    "an Admin named the household's provider customer",
  );
});

test("a payment is recorded once per provider id, and keeps a code and four digits at most", () => {
  assert.throws(
    () => psql(`insert into public.payments (household_id, provider, provider_payment_id, status) values ('${household}', 'razorpay', 'pay_test_1', 'failed');`, options),
    "a redelivered payment was stored twice",
  );
  const insert = (column, value) =>
    `insert into public.payments (household_id, provider, provider_payment_id, status, ${column}) values ('${household}', 'razorpay', 'pay_${column}', 'failed', ${value});`;
  assert.throws(() => psql(insert("failure_code", `'Card declined for Priya'`), options), "the provider's prose was kept");
  assert.throws(() => psql(insert("method_last4", `'4111111111111111'`), options), "a card number was kept");
  assert.throws(() => psql(insert("method", `'crypto'`), options));
  assert.throws(() => psql(`insert into public.payments (household_id, provider, provider_payment_id, status) values ('${household}', 'razorpay', 'pay_bad', 'paid');`, options));
  assert.throws(
    () => psql(`insert into public.billing_invoices (household_id, provider, provider_invoice_id, status, issued_at, invoice_url) values ('${household}', 'razorpay', 'inv_http', 'paid', now(), 'http://example.test/i');`, options),
    "an invoice link that is not https",
  );
});

test("a refund is pending until the provider confirms it, and only then has a completion time", () => {
  assert.equal(psql(`select status from public.payment_refunds where payment_id = '${payment}';`, options), "pending");
  assert.throws(
    () => psql(`update public.payment_refunds set status = 'succeeded' where payment_id = '${payment}';`, options),
    "a refund marked succeeded with no completion time",
  );
  assert.throws(
    () => psql(`update public.payment_refunds set completed_at = now() where payment_id = '${payment}';`, options),
    "a pending refund with a completion time",
  );
  psql(`update public.payment_refunds set status = 'succeeded', completed_at = now(), provider_refund_id = 'rfnd_test_1' where payment_id = '${payment}';`, options);
  assert.throws(
    () => psql(`insert into public.payment_refunds (household_id, payment_id, provider, provider_refund_id, amount, currency) values ('${household}', '${payment}', 'razorpay', 'rfnd_test_1', 1, 'INR');`, options),
    "the same provider refund was stored twice",
  );
  assert.throws(() => psql(`insert into public.payment_refunds (household_id, payment_id, provider, amount, currency) values ('${household}', '${payment}', 'razorpay', 0, 'INR');`, options));
});

test("an Admin's checkout intent carries the price, interval and currency it was opened for", () => {
  const intent = asProfile(
    HEAD,
    `insert into public.billing_intents (household_id, plan_key, provider, created_by_member_id, plan_price_id, billing_interval, currency)
     values ('${household}', 'pro', 'razorpay', '${headMember}', '${price}', 'month', 'INR') returning id;`,
    options,
  );
  assert.match(intent, /^[0-9a-f-]{36}$/);
  assert.equal(psql(`select plan_price_id || ' ' || billing_interval || ' ' || currency from public.billing_intents where id = '${intent}';`, options), `${price} month INR`);
});

test("the subscription learns its terms, and only the server moves them", () => {
  psql(
    `insert into public.household_subscriptions (household_id, plan_key) values ('${household}', 'pro')
     on conflict (household_id) do update set plan_key = excluded.plan_key;
     update public.household_subscriptions set provider = 'razorpay', billing_interval = 'month', currency = 'INR', amount = 299.00,
       cancel_at_period_end = true, scheduled_plan_key = 'free' where household_id = '${household}';`,
    options,
  );
  assert.equal(
    asProfile(HEAD, `select provider || ' ' || billing_interval || ' ' || amount || ' ' || cancel_at_period_end from public.household_subscriptions;`, options),
    "razorpay month 299.00 true",
  );
  assert.throws(() => psql(`update public.household_subscriptions set provider = 'paypal' where household_id = '${household}';`, options));
  assert.throws(() => psql(`update public.household_subscriptions set scheduled_plan_key = 'nonexistent' where household_id = '${household}';`, options));
});

test("the new event types and the 'recorded' outcome are the only new words billing events accept", () => {
  for (const [type, id] of [
    ["subscription.cancel_scheduled", "e1"],
    ["payment.succeeded", "e2"],
    ["payment.attempt_failed", "e3"],
    ["refund.succeeded", "e4"],
    ["refund.failed", "e5"],
  ]) {
    psql(
      `insert into public.billing_events (provider, provider_event_id, household_id, event_type, occurred_at, applied, outcome)
       values ('razorpay', '${id}', '${household}', '${type}', now(), false, 'recorded');`,
      options,
    );
  }
  assert.throws(() =>
    psql(`insert into public.billing_events (provider, provider_event_id, household_id, event_type, occurred_at) values ('razorpay', 'e6', '${household}', 'payment.refunded_maybe', now());`, options),
  );
  assert.throws(() =>
    psql(`insert into public.billing_events (provider, provider_event_id, household_id, event_type, occurred_at, outcome) values ('razorpay', 'e7', '${household}', 'refund.failed', now(), 'guessed');`, options),
  );
});
