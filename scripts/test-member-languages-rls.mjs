#!/usr/bin/env node
/**
 * Member languages authorization tests.
 *
 * Every member reads the household's list; a member changes their own and an
 * Admin anyone's; nobody reaches another household's, and a row can never
 * name a member of a different household.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_member_languages_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const HELPER = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";

let household = "";
let headMember = "";
let adultMember = "";
let helperMember = "";
let otherHousehold = "";
let otherMember = "";

function digest(token) {
  return psql(`select encode(digest('${token}', 'sha256'), 'hex');`, options);
}

function join(profile, token, role, name) {
  psql(
    `insert into public.household_invitations (household_id, invited_by_member_id, email, display_name, role, token_hash, expires_at)
     values ('${household}', '${headMember}', '${role}@example.test', '${name}', '${role}', '${digest(token)}', now() + interval '7 days');`,
    options,
  );
  asProfile(profile, `select wh.accept_invitation('${digest(token)}', '${name}');`, options);
  return psql(`select id from public.household_members where profile_id = '${profile}';`, options);
}

before(() => {
  buildTestDatabase(DB);
  psql(`create extension if not exists pgcrypto;`, options);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'head@example.test'), ('${ADULT}', 'adult@example.test'),
       ('${HELPER}', 'helper@example.test'), ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Sharma Home', 'Kunal');`, options).split(" ");
  [otherHousehold, otherMember] = asProfile(OUTSIDER, `select household_id || ' ' || member_id from wh.create_household('Other Home', 'Olu');`, options).split(" ");
  adultMember = join(ADULT, "token-adult-0000000000000000000000000", "adult", "Asha");
  helperMember = join(HELPER, "token-helper-000000000000000000000000", "helper", "Sunita");
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a member records their own languages", () => {
  asProfile(HELPER, `insert into public.member_languages (household_id, member_id, language, fluency) values ('${household}', '${helperMember}', 'kn', 'native'), ('${household}', '${helperMember}', 'hi', 'conversational');`, options);
  assert.equal(asProfile(HELPER, `select count(*) from public.member_languages where member_id = '${helperMember}';`, options), "2");
});

test("an Admin records anyone's; a plain adult cannot record someone else's", () => {
  asProfile(HEAD, `insert into public.member_languages (household_id, member_id, language, fluency) values ('${household}', '${adultMember}', 'mr', 'native');`, options);
  assert.ok(deniedForProfile(ADULT, `insert into public.member_languages (household_id, member_id, language, fluency) values ('${household}', '${headMember}', 'en', 'basic');`, options));
  assert.ok(
    deniedForUpdate(
      ADULT,
      `update public.member_languages set fluency = 'basic' where member_id = '${helperMember}' and language = 'kn';`,
      `select fluency from public.member_languages where member_id = '${helperMember}' and language = 'kn';`,
      "native",
      options,
    ),
  );
});

test("every member reads the household's list; another household reads none of it", () => {
  assert.equal(asProfile(ADULT, `select count(*) from public.member_languages;`, options), "3");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.member_languages;`, options), "0");
});

test("a row can never name a member of another household", () => {
  assert.ok(deniedForProfile(HEAD, `insert into public.member_languages (household_id, member_id, language, fluency) values ('${household}', '${otherMember}', 'en', 'fluent');`, options));
  assert.ok(deniedForProfile(OUTSIDER, `insert into public.member_languages (household_id, member_id, language, fluency) values ('${otherHousehold}', '${adultMember}', 'en', 'fluent');`, options));
});

test("only the four levels, and one row per language per person", () => {
  assert.ok(deniedForProfile(HEAD, `insert into public.member_languages (household_id, member_id, language, fluency) values ('${household}', '${headMember}', 'en', 'expert');`, options));
  asProfile(HEAD, `insert into public.member_languages (household_id, member_id, language, fluency) values ('${household}', '${headMember}', 'en', 'fluent');`, options);
  assert.ok(deniedForProfile(HEAD, `insert into public.member_languages (household_id, member_id, language, fluency) values ('${household}', '${headMember}', 'en', 'native');`, options));
});

test("a member removes their own", () => {
  asProfile(HELPER, `delete from public.member_languages where member_id = '${helperMember}' and language = 'hi';`, options);
  assert.equal(asProfile(HELPER, `select count(*) from public.member_languages where member_id = '${helperMember}';`, options), "1");
});
