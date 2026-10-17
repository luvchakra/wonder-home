#!/usr/bin/env node
/**
 * The Gemini voice key: an Admin sets and removes it, nobody can ever read
 * it back (not even the Admin who set it), an ordinary adult cannot write
 * it, and the status function says only that it is set and when.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_gemini_voice_key_test";
const options = { database: DB };

const OWNER = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const KEY = "AIzaSyTESTKEY-not-a-real-one-0000000";

let household = "";
let ownerMember = "";
let adultMember = "";

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${OWNER}', 'owner@example.test'), ('${ADULT}', 'adult@example.test'), ('${OUTSIDER}', 'outsider@example.test');`, options);
  [household, ownerMember] = asProfile(OWNER, `select household_id || ' ' || member_id from wh.create_household('Sharma Home', 'Kunal');`, options).split(" ");
  asProfile(OUTSIDER, `select wh.create_household('Other Home', 'Olu');`, options);
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Asha');`, options);
  adultMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Asha') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("an Admin sets the Gemini voice key, and it is Google's only", () => {
  asProfile(OWNER, `insert into public.household_gemini_voice_credentials (household_id, api_key, set_by_member_id) values ('${household}', '${KEY}', '${ownerMember}');`, options);
  assert.ok(deniedForProfile(OWNER, `update public.household_gemini_voice_credentials set provider = 'anthropic' where household_id = '${household}';`, options));
});

test("an Admin replaces it the way the app does, with an update that reads nothing back", () => {
  asProfile(OWNER, `update public.household_gemini_voice_credentials set api_key = '${KEY}x', set_by_member_id = '${ownerMember}' where household_id = '${household}';`, options);
  assert.equal(psql(`select api_key from public.household_gemini_voice_credentials;`, options), `${KEY}x`);
});

test("nobody can read a stored key back, the Admin who set it included, on any key table", () => {
  assert.ok(deniedForProfile(OWNER, `select api_key from public.household_gemini_voice_credentials;`, options));
  assert.ok(deniedForProfile(ADULT, `select api_key from public.household_gemini_voice_credentials;`, options));
  asProfile(OWNER, `insert into public.household_ai_credentials (household_id, provider, api_key, set_by_member_id) values ('${household}', 'anthropic', 'test-assistant-key-placeholder-0000', '${ownerMember}');`, options);
  assert.ok(deniedForProfile(OWNER, `select api_key from public.household_ai_credentials;`, options));
  assert.ok(deniedForProfile(OWNER, `select * from public.household_voice_credentials;`, options));
  // The row itself is still there to replace or remove; only the key is unreadable.
  assert.equal(asProfile(OWNER, `select provider from public.household_ai_credentials;`, options), "anthropic");
});

test("members see only that it is set; another household sees nothing", () => {
  assert.equal(asProfile(ADULT, `select configured::text || ' ' || provider from public.gemini_voice_credential_status('${household}');`, options), "true google");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.gemini_voice_credential_status('${household}');`, options), "0");
});

test("an ordinary adult cannot set or remove it", () => {
  assert.ok(deniedForProfile(ADULT, `insert into public.household_gemini_voice_credentials (household_id, api_key) values ('${household}', '${KEY}') on conflict (household_id) do update set api_key = excluded.api_key;`, options));
  asProfile(ADULT, `delete from public.household_gemini_voice_credentials where household_id = '${household}';`, options);
  assert.equal(psql(`select count(*) from public.household_gemini_voice_credentials;`, options), "1");
});

test("an Admin removes it", () => {
  asProfile(OWNER, `delete from public.household_gemini_voice_credentials where household_id = '${household}';`, options);
  assert.equal(psql(`select count(*) from public.household_gemini_voice_credentials;`, options), "0");
});
