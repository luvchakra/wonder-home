#!/usr/bin/env node
/**
 * Push subscriptions (story 23-015): the devices a member turned push on for.
 *
 * A member registers and removes only their own devices and reads only their
 * own; another member of the same household, an Admin included, sees none of
 * them (a device is personal), and nobody edits one from a session — send
 * results are the server's to record.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_push_subscriptions_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const KEY = "B".repeat(87);
const AUTH = "A".repeat(22);

let household = "";
let headMember = "";
let adultMember = "";

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test'), ('${OUTSIDER}', 'olu@example.test');`, options);
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya');`, options);
  adultMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  asProfile(OUTSIDER, `select wh.create_household('Other Home', 'Olu');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a member registers their own device and reads it back", () => {
  asProfile(ADULT, `insert into public.push_subscriptions (household_id, member_id, endpoint, p256dh, auth, label) values ('${household}', '${adultMember}', 'https://push.example/priya', '${KEY}', '${AUTH}', 'Chrome on Android');`, options);
  assert.equal(asProfile(ADULT, `select count(*) from public.push_subscriptions;`, options), "1");
});

test("nobody registers a device for someone else", () => {
  assert.ok(deniedForProfile(ADULT, `insert into public.push_subscriptions (household_id, member_id, endpoint, p256dh, auth) values ('${household}', '${headMember}', 'https://push.example/not-mine', '${KEY}', '${AUTH}');`, options));
  assert.ok(deniedForProfile(OUTSIDER, `insert into public.push_subscriptions (household_id, member_id, endpoint, p256dh, auth) values ('${household}', '${adultMember}', 'https://push.example/outsider', '${KEY}', '${AUTH}');`, options));
});

test("a device is personal: an Admin of the same household sees none of another member's", () => {
  assert.equal(asProfile(HEAD, `select count(*) from public.push_subscriptions;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.push_subscriptions;`, options), "0");
});

test("only an https endpoint and real keys are kept", () => {
  assert.throws(() => psql(`insert into public.push_subscriptions (household_id, member_id, endpoint, p256dh, auth) values ('${household}', '${adultMember}', 'http://push.example/x', '${KEY}', '${AUTH}');`, options), /check/);
  assert.throws(() => psql(`insert into public.push_subscriptions (household_id, member_id, endpoint, p256dh, auth) values ('${household}', '${adultMember}', 'https://push.example/y', 'short', '${AUTH}');`, options), /check/);
});

test("send results are the server's: a session cannot edit a device", () => {
  asProfile(ADULT, `update public.push_subscriptions set failure_count = 99;`, options);
  assert.equal(psql(`select failure_count from public.push_subscriptions where endpoint = 'https://push.example/priya';`, options), "0");
});

test("a member removes their own device; another's stays", () => {
  psql(`insert into public.push_subscriptions (household_id, member_id, endpoint, p256dh, auth) values ('${household}', '${headMember}', 'https://push.example/kunal', '${KEY}', '${AUTH}');`, options);
  asProfile(ADULT, `delete from public.push_subscriptions;`, options);
  assert.equal(psql(`select string_agg(endpoint, ',' order by endpoint) from public.push_subscriptions;`, options), "https://push.example/kunal");
});
