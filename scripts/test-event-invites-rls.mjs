#!/usr/bin/env node
/**
 * Event invite links and guest replies.
 *
 * Members read and make an event's link and read its replies; another
 * household sees neither; nobody writes a reply from a session (only the
 * server, after matching the link). Whoever owns an event asks household
 * members to it; another member cannot change who an owned event asks.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_event_invites_test";
const options = { database: DB };

const OWNER = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const TOKEN = "Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDEF";

let household = "";
let ownerMember = "";
let adultMember = "";
let ownedByAdult = "";

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${OWNER}', 'owner@example.test'), ('${ADULT}', 'adult@example.test'), ('${OUTSIDER}', 'outsider@example.test');`, options);
  [household, ownerMember] = asProfile(OWNER, `select household_id || ' ' || member_id from wh.create_household('Sharma Home', 'Kunal');`, options).split(" ");
  asProfile(OUTSIDER, `select wh.create_household('Other Home', 'Olu');`, options);
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Asha');`, options);
  adultMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Asha') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  ownedByAdult = psql(
    `insert into public.family_events (household_id, title, kind, starts_at, ends_at, owner_member_id) values ('${household}', 'Asha''s party', 'birthday', now() + interval '2 days', now() + interval '2 days 3 hours', '${adultMember}') returning id;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("the event's owner asks household members to it", () => {
  asProfile(ADULT, `insert into public.event_participants (household_id, event_id, member_id) values ('${household}', '${ownedByAdult}', '${ownerMember}');`, options);
  assert.equal(psql(`select count(*) from public.event_participants where event_id = '${ownedByAdult}';`, options), "1");
});

test("a member who is neither the owner nor an Admin cannot change who an owned event asks", () => {
  const other = psql(`insert into public.family_events (household_id, title, kind, starts_at, ends_at, owner_member_id) values ('${household}', 'Kunal''s plan', 'outing', now() + interval '3 days', now() + interval '3 days 2 hours', '${ownerMember}') returning id;`, options);
  assert.ok(deniedForProfile(ADULT, `insert into public.event_participants (household_id, event_id, member_id) values ('${household}', '${other}', '${ownerMember}');`, options));
});

test("a member makes the event's link; members read it, another household does not", () => {
  asProfile(ADULT, `insert into public.event_invite_links (household_id, event_id, token, created_by_member_id) values ('${household}', '${ownedByAdult}', '${TOKEN}', '${adultMember}');`, options);
  assert.equal(asProfile(OWNER, `select count(*) from public.event_invite_links;`, options), "1");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.event_invite_links;`, options), "0");
  assert.ok(deniedForProfile(ADULT, `insert into public.event_invite_links (household_id, event_id, token, created_by_member_id) values ('${household}', '${ownedByAdult}', 'short', '${adultMember}');`, options));
});

test("nobody writes a guest reply from a session; members read and remove replies", () => {
  assert.ok(deniedForProfile(OWNER, `insert into public.event_guests (household_id, event_id, name, response) values ('${household}', '${ownedByAdult}', 'Ravi', 'yes');`, options));
  assert.ok(deniedForProfile(OUTSIDER, `insert into public.event_guests (household_id, event_id, name, response) values ('${household}', '${ownedByAdult}', 'Ravi', 'yes');`, options));
  const guest = psql(`insert into public.event_guests (household_id, event_id, name, response) values ('${household}', '${ownedByAdult}', 'Ravi', 'yes') returning id;`, options);
  assert.equal(asProfile(ADULT, `select name from public.event_guests;`, options), "Ravi");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.event_guests;`, options), "0");
  asProfile(OWNER, `delete from public.event_guests where id = '${guest}';`, options);
  assert.equal(psql(`select count(*) from public.event_guests;`, options), "0");
});
