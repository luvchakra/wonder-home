#!/usr/bin/env node
/**
 * Amounts given ahead for a recurring bill's coming periods (story 11-010).
 *
 * Those who see the bills see them: an Admin and an adult. Only an Admin
 * writes them. A child sees none, another household sees none, and a period
 * can only be about a bill of the same household.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_bill_periods_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const KID = "44444444-4444-4444-8444-444444444444";

let household = "";
let outsiderHousehold = "";
let bill = "";
let outsiderBill = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test'), ('${OUTSIDER}', 'olu@example.test'), ('${KID}', 'anaya@example.test');`,
    options,
  );
  let headMember = "";
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya'), ('${KID}', 'Anaya');`, options);
  const adultMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  const child = asProfile(HEAD, `select wh.create_child_member('${household}', 'Anaya', '2016-09-18', array['${headMember}']::uuid[]);`, options);
  psql(`update public.household_members set profile_id = '${KID}' where id = '${child}';`, options);
  outsiderHousehold = asProfile(OUTSIDER, `select household_id from wh.create_household('Other Home', 'Olu');`, options);
  bill = asProfile(
    HEAD,
    `insert into public.obligations (household_id, name, kind, due_on, recurrence, bill_type, status) values ('${household}', 'Rent', 'rent', '2026-11-01', 'monthly', 'rent', 'expected') returning id;`,
    options,
  );
  outsiderBill = asProfile(OUTSIDER, `insert into public.obligations (household_id, name, kind) values ('${outsiderHousehold}', 'Their rent', 'rent') returning id;`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("an Admin gives next month's amount ahead, once per period", () => {
  asProfile(HEAD, `insert into public.obligation_periods (household_id, obligation_id, period_label, amount_minor, currency) values ('${household}', '${bill}', '2026-12', 2600000, 'INR');`, options);
  assert.throws(
    () => asProfile(HEAD, `insert into public.obligation_periods (household_id, obligation_id, period_label, amount_minor, currency) values ('${household}', '${bill}', '2026-12', 1, 'INR');`, options),
    /duplicate key/,
  );
  assert.throws(
    () => asProfile(HEAD, `insert into public.obligation_periods (household_id, obligation_id, period_label, amount_minor, currency) values ('${household}', '${bill}', '2026-13', 1, 'INR');`, options),
    /check constraint/,
  );
});

test("an adult reads it but cannot change it", () => {
  assert.equal(asProfile(ADULT, `select count(*) from public.obligation_periods;`, options), "1");
  asProfile(ADULT, `update public.obligation_periods set amount_minor = 1;`, options);
  assert.equal(psql(`select amount_minor from public.obligation_periods;`, options), "2600000");
  assert.throws(
    () => asProfile(ADULT, `insert into public.obligation_periods (household_id, obligation_id, period_label, amount_minor, currency) values ('${household}', '${bill}', '2027-01', 1, 'INR');`, options),
    /row-level security/,
  );
});

test("a child and another household see nothing", () => {
  assert.equal(asProfile(KID, `select count(*) from public.obligation_periods;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.obligation_periods;`, options), "0");
});

test("a period is only ever about the household's own bill", () => {
  assert.throws(
    () => asProfile(HEAD, `insert into public.obligation_periods (household_id, obligation_id, period_label, amount_minor, currency) values ('${household}', '${outsiderBill}', '2027-01', 1, 'INR');`, options),
    /./,
  );
  assert.throws(
    () => asProfile(OUTSIDER, `insert into public.obligation_periods (household_id, obligation_id, period_label, amount_minor, currency) values ('${outsiderHousehold}', '${bill}', '2027-01', 1, 'INR');`, options),
    /./,
  );
});

test("an Admin takes it back out", () => {
  asProfile(HEAD, `delete from public.obligation_periods where obligation_id = '${bill}';`, options);
  assert.equal(psql(`select count(*) from public.obligation_periods;`, options), "0");
});
