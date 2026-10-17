#!/usr/bin/env node
/**
 * Home address authorization tests.
 *
 * A home address is read by the household's adults and Admins only, never
 * a helper and never another household; only an Admin sets, changes or
 * removes it, and only in their own name.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_household_address_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const HELPER = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";

let household = "";
let headMember = "";
let adultMember = "";

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
  asProfile(OUTSIDER, `select wh.create_household('Other Home', 'Olu');`, options);
  adultMember = join(ADULT, "token-adult-0000000000000000000000000", "adult", "Asha");
  join(HELPER, "token-helper-000000000000000000000000", "helper", "Sunita");
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("an Admin sets the home address in their own name", () => {
  asProfile(
    HEAD,
    `insert into public.household_addresses (household_id, formatted_address, place_id, latitude, longitude, set_by_member_id)
     values ('${household}', '12 MG Road, Bengaluru', 'abc', 12.975, 77.605, '${headMember}');`,
    options,
  );
  assert.equal(asProfile(HEAD, `select formatted_address from public.household_addresses where household_id = '${household}';`, options), "12 MG Road, Bengaluru");
});

test("an adult reads it; a helper and another household never do", () => {
  assert.equal(asProfile(ADULT, `select count(*) from public.household_addresses;`, options), "1");
  assert.equal(asProfile(HELPER, `select count(*) from public.household_addresses;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.household_addresses;`, options), "0");
});

test("only an Admin changes or removes it, and never in someone else's name", () => {
  assert.ok(
    deniedForUpdate(
      ADULT,
      `update public.household_addresses set formatted_address = 'Elsewhere' where household_id = '${household}';`,
      `select formatted_address from public.household_addresses where household_id = '${household}';`,
      "12 MG Road, Bengaluru",
      options,
    ),
  );
  asProfile(ADULT, `delete from public.household_addresses where household_id = '${household}';`, options);
  assert.equal(asProfile(HEAD, `select count(*) from public.household_addresses;`, options), "1");
  assert.ok(deniedForProfile(HEAD, `update public.household_addresses set set_by_member_id = '${adultMember}' where household_id = '${household}';`, options));
  asProfile(HEAD, `delete from public.household_addresses where household_id = '${household}';`, options);
  assert.equal(asProfile(HEAD, `select count(*) from public.household_addresses;`, options), "0");
});

test("a typed address has no point, and a point needs both coordinates", () => {
  asProfile(HEAD, `insert into public.household_addresses (household_id, formatted_address, set_by_member_id) values ('${household}', 'Flat 4, Lake View', '${headMember}');`, options);
  assert.ok(deniedForProfile(HEAD, `update public.household_addresses set latitude = 12.9 where household_id = '${household}';`, options));
});

test("a pet's photo path and a member's preferred name are stored", () => {
  asProfile(HEAD, `insert into public.pets (household_id, name, species, photo_path) values ('${household}', 'Bruno', 'Dog', '${household}/pets/x');`, options);
  asProfile(HEAD, `update public.household_members set nickname = 'Kuku', nickname_preferred = true where id = '${headMember}';`, options);
  assert.equal(asProfile(HEAD, `select nickname_preferred from public.household_members where id = '${headMember}';`, options), "t");
});
