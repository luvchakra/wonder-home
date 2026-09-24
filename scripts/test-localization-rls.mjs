#!/usr/bin/env node
/**
 * Language, region and currency authorization tests (stories 22-002/22-003).
 *
 * A person's presentation — language, date and time format, units — is
 * theirs, or an Admin's. The household's region, currency, time zone and
 * default language are an Admin's alone. Nothing here may reach another
 * household, and every stored value is a closed code, never free text.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_localization_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let adultMember = "";

function digest(token) {
  return psql(`select encode(digest('${token}', 'sha256'), 'hex');`, options);
}

before(() => {
  buildTestDatabase(DB);
  psql(`create extension if not exists pgcrypto;`, options);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'),
       ('${ADULT}', 'priya@example.test'),
       ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  asProfile(OUTSIDER, `select wh.create_household('Other Home', 'Olu');`, options);
  psql(
    `insert into public.household_invitations (household_id, invited_by_member_id, email, display_name, role, token_hash, expires_at)
     values ('${household}', '${headMember}', 'priya@example.test', 'Priya', 'adult', '${digest("token-l10n-000000000000000000000000")}', now() + interval '7 days');`,
    options,
  );
  adultMember = asProfile(ADULT, `select member_id from wh.accept_invitation('${digest("token-l10n-000000000000000000000000")}', 'Priya');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a member chooses their own language and formats", () => {
  asProfile(ADULT, `update public.household_members set language = 'hi', date_format = 'dmy', time_format = '24h', measurement_system = 'metric' where id = '${adultMember}';`, options);
  assert.equal(psql(`select language || ' ' || date_format || ' ' || time_format from public.household_members where id = '${adultMember}';`, options), "hi dmy 24h");
});

test("a member cannot choose another member's language", () => {
  assert.ok(
    deniedForUpdate(
      ADULT,
      `update public.household_members set language = 'mr' where id = '${headMember}';`,
      `select coalesce(language, 'none') from public.household_members where id = '${headMember}';`,
      "none",
      options,
    ),
    "a member changed someone else's language",
  );
});

test("an Admin sets any member's language", () => {
  asProfile(HEAD, `update public.household_members set language = 'mr' where id = '${adultMember}';`, options);
  assert.equal(psql(`select language from public.household_members where id = '${adultMember}';`, options), "mr");
});

test("changing a language never reaches a member's type, status or account", () => {
  assert.ok(
    deniedForProfile(ADULT, `update public.household_members set language = 'en', member_type = 'helper' where id = '${adultMember}';`, options) ||
      psql(`select member_type from public.household_members where id = '${adultMember}';`, options) === "adult",
    "a language change carried a member-type change with it",
  );
});

test("only an Admin sets the household's region, currency, time zone and default language", () => {
  asProfile(HEAD, `update public.households set region = 'IN', currency = 'INR', timezone = 'Asia/Kolkata', measurement_system = 'metric', default_language = 'hi' where id = '${household}';`, options);
  assert.equal(psql(`select region || ' ' || currency || ' ' || default_language from public.households where id = '${household}';`, options), "IN INR hi");
  assert.ok(
    deniedForUpdate(ADULT, `update public.households set currency = 'USD' where id = '${household}';`, `select currency from public.households where id = '${household}';`, "INR", options),
    "a member who is not an Admin changed the household currency",
  );
  assert.ok(
    deniedForUpdate(OUTSIDER, `update public.households set currency = 'USD' where id = '${household}';`, `select currency from public.households where id = '${household}';`, "INR", options),
    "another household changed this household's currency",
  );
});

test("another household cannot read this household's region or currency", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.households where id = '${household}';`, options), "0");
});

test("every stored value is a closed code, never free text", () => {
  for (const [sql, what] of [
    [`update public.households set region = 'India' where id = '${household}';`, "a region name"],
    [`update public.households set currency = 'rupee' where id = '${household}';`, "a currency name"],
    [`update public.households set measurement_system = 'furlongs' where id = '${household}';`, "a measurement system"],
    [`update public.household_members set language = 'Hindi' where id = '${headMember}';`, "a language name"],
    [`update public.household_members set date_format = 'dd.mm.yyyy' where id = '${headMember}';`, "a date pattern"],
    [`update public.household_members set time_format = '36h' where id = '${headMember}';`, "a time format"],
    [`update public.household_members set locale_setup_status = 'forced' where id = '${headMember}';`, "a setup status"],
  ]) {
    assert.ok(deniedForProfile(HEAD, sql, options), `${what} was stored as free text`);
  }
});

test("a member records their own localization events, and nothing else", () => {
  asProfile(ADULT, `insert into public.onboarding_events (household_id, event, detail) values ('${household}', 'language_changed', '{"language":"hi"}');`, options);
  assert.ok(
    deniedForProfile(ADULT, `insert into public.onboarding_events (household_id, event) values ('${household}', 'setup_completed');`, options),
    "a member recorded a family-setup event",
  );
  assert.ok(
    deniedForProfile(OUTSIDER, `insert into public.onboarding_events (household_id, event) values ('${household}', 'language_changed');`, options),
    "an outsider recorded an event in another household",
  );
});

test("a member keeps their own setup state; an Admin's is theirs too", () => {
  asProfile(ADULT, `update public.household_members set locale_setup_status = 'skipped', locale_setup_step = 'language' where id = '${adultMember}';`, options);
  assert.equal(psql(`select locale_setup_status from public.household_members where id = '${adultMember}';`, options), "skipped");
  assert.ok(
    deniedForUpdate(
      ADULT,
      `update public.household_members set locale_setup_status = 'completed' where id = '${headMember}';`,
      `select coalesce(locale_setup_status, 'none') from public.household_members where id = '${headMember}';`,
      "none",
      options,
    ),
    "a member moved someone else's setup",
  );
});
