#!/usr/bin/env node
/**
 * HomePlaces place book authorization tests.
 *
 * Every member reads the household's saved and turned-down places; only an
 * adult or Admin changes them, and only in their own name. Another household
 * never sees them.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_household_places_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const HELPER = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";

let household = "";
let headMember = "";
let adultMember = "";
let helperMember = "";

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

function save(profile, member, placeId, status = "saved") {
  return `insert into public.household_places (household_id, place_id, name, kind, latitude, longitude, maps_uri, status, set_by_member_id)
          values ('${household}', '${placeId}', 'Cubbon Park', 'Park', 12.9763, 77.5929, 'https://maps.google.com/?cid=1', '${status}', '${member}')`;
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
  asProfile(OUTSIDER, `select wh.create_household('Other Home', 'Olu');`, options);
  adultMember = join(ADULT, "token-adult-0000000000000000000000000", "adult", "Asha");
  helperMember = join(HELPER, "token-helper-000000000000000000000000", "helper", "Sunita");
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("an adult saves a place in their own name, once per place", () => {
  asProfile(ADULT, `${save(ADULT, adultMember, "place-1")};`, options);
  assert.ok(deniedForProfile(ADULT, `${save(ADULT, adultMember, "place-1")};`, options));
  assert.ok(deniedForProfile(ADULT, `${save(ADULT, headMember, "place-2")};`, options));
});

test("every member reads the place book; another household never does", () => {
  assert.equal(asProfile(HEAD, `select count(*) from public.household_places;`, options), "1");
  assert.equal(asProfile(HELPER, `select count(*) from public.household_places;`, options), "1");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.household_places;`, options), "0");
});

test("a helper cannot save, change or forget a place", () => {
  assert.ok(deniedForProfile(HELPER, `${save(HELPER, helperMember, "place-3")};`, options));
  assert.ok(
    deniedForUpdate(
      HELPER,
      `update public.household_places set status = 'not_for_us' where place_id = 'place-1';`,
      `select status from public.household_places where place_id = 'place-1';`,
      "saved",
      options,
    ),
  );
  asProfile(HELPER, `delete from public.household_places where place_id = 'place-1';`, options);
  assert.equal(asProfile(HEAD, `select count(*) from public.household_places;`, options), "1");
});

test("an Admin turns a place down and forgets it; the status is one of two words", () => {
  asProfile(HEAD, `update public.household_places set status = 'not_for_us', set_by_member_id = '${headMember}' where place_id = 'place-1';`, options);
  assert.equal(asProfile(HEAD, `select status from public.household_places where place_id = 'place-1';`, options), "not_for_us");
  assert.ok(deniedForProfile(HEAD, `update public.household_places set status = 'maybe' where place_id = 'place-1';`, options));
  assert.ok(deniedForProfile(HEAD, `update public.household_places set maps_uri = 'javascript:alert(1)' where place_id = 'place-1';`, options));
  asProfile(HEAD, `delete from public.household_places where place_id = 'place-1';`, options);
  assert.equal(asProfile(HEAD, `select count(*) from public.household_places;`, options), "0");
});
