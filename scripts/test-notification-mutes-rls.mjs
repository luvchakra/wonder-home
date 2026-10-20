#!/usr/bin/env node
/**
 * Which channel carries which kind of reminder (story 27-002, the owner, 2026-10-20).
 *
 * - A member reads, adds and removes only their own mutes: not another member's
 *   of the same household, and not another household's.
 * - A mute names a kind and a channel from the closed lists; in-app cannot be
 *   muted; the same mute is one row.
 * - A member cannot write a mute for someone else, or into a household they
 *   are not in.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_notification_mutes_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let adultMember = "";
let other = "";
let otherMember = "";

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'upasana@example.test'), ('${OUTSIDER}', 'olu@example.test');`, options);
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Upasana');`, options);
  adultMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Upasana') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  [other, otherMember] = asProfile(OUTSIDER, `select household_id || ' ' || member_id from wh.create_household('Other Home', 'Olu');`, options).split(" ");
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a member keeps a kind of reminder off a channel, and reads it back", () => {
  asProfile(HEAD, `insert into public.notification_channel_mutes (household_id, member_id, category, channel) values ('${household}', '${headMember}', 'bills', 'push');`, options);
  assert.equal(asProfile(HEAD, `select category || ':' || channel from public.notification_channel_mutes;`, options), "bills:push");
});

test("the same mute is one row", () => {
  assert.throws(() => asProfile(HEAD, `insert into public.notification_channel_mutes (household_id, member_id, category, channel) values ('${household}', '${headMember}', 'bills', 'push');`, options), /duplicate key|notification_channel_mutes_pkey/);
});

test("a kind and a channel come from the closed lists, and in-app cannot be muted", () => {
  assert.throws(() => asProfile(HEAD, `insert into public.notification_channel_mutes (household_id, member_id, category, channel) values ('${household}', '${headMember}', 'gossip', 'push');`, options), /category_check/);
  assert.throws(() => asProfile(HEAD, `insert into public.notification_channel_mutes (household_id, member_id, category, channel) values ('${household}', '${headMember}', 'bills', 'in_app');`, options), /channel_check/);
});

test("another member of the household sees none of it, and cannot write for someone else", () => {
  assert.equal(asProfile(ADULT, `select count(*) from public.notification_channel_mutes;`, options), "0");
  assert.ok(deniedForProfile(ADULT, `insert into public.notification_channel_mutes (household_id, member_id, category, channel) values ('${household}', '${headMember}', 'school', 'email');`, options));
  assert.equal(psql(`select count(*) from public.notification_channel_mutes where category = 'school';`, options), "0");
});

test("another household sees none of it, and cannot write into this one", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.notification_channel_mutes;`, options), "0");
  assert.ok(deniedForProfile(OUTSIDER, `insert into public.notification_channel_mutes (household_id, member_id, category, channel) values ('${household}', '${otherMember}', 'school', 'email');`, options));
  assert.ok(deniedForProfile(OUTSIDER, `insert into public.notification_channel_mutes (household_id, member_id, category, channel) values ('${other}', '${headMember}', 'school', 'email');`, options));
});

test("a member removes their own mute, and only theirs", () => {
  asProfile(ADULT, `insert into public.notification_channel_mutes (household_id, member_id, category, channel) values ('${household}', '${adultMember}', 'meals', 'email');`, options);
  asProfile(ADULT, `delete from public.notification_channel_mutes where category = 'bills';`, options);
  assert.equal(psql(`select count(*) from public.notification_channel_mutes where category = 'bills';`, options), "1", "another member's mute is out of reach");
  asProfile(ADULT, `delete from public.notification_channel_mutes;`, options);
  assert.equal(psql(`select count(*) from public.notification_channel_mutes where member_id = '${adultMember}';`, options), "0");
});
