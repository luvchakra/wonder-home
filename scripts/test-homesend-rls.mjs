#!/usr/bin/env node
/**
 * HomeSend intake database tests (Phase C).
 *
 * The rule under test is simpler than school's guardianship: `home_send_items`
 * is a shared household inbox, so any member may see and act on an item, but
 * only within their own household, and only ever with `created_by_member_id`
 * naming themselves. The content and routing check constraints are the other
 * half — a row that claims a source with no matching content, or a route
 * that names a table without an id (or the reverse), should never reach the
 * table at all.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_homesend_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const OTHER_ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let otherHousehold = "";
let itemId = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'priya@example.test'),
       ('${OTHER_ADULT}', 'adult@example.test'),
       ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Priya');`,
    options,
  ).split(" ");

  [otherHousehold] = asProfile(
    OUTSIDER,
    `select household_id || ' ' || member_id from wh.create_household('Outsider Home', 'Outsider');`,
    options,
  ).split(" ");

  psql(`insert into public.profiles (id, display_name) values ('${OTHER_ADULT}', 'Another adult');`, options);
  psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${OTHER_ADULT}', 'adult', 'Another adult');`,
    options,
  );

  itemId = asProfile(
    HEAD,
    `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text)
     values ('${household}', '${headMember}', 'pasted_text', 'Electricity bill due Friday, Rs 1200')
     returning id;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("the sender sees their own intake item", () => {
  assert.equal(asProfile(HEAD, `select count(*) from public.home_send_items;`, options), "1");
});

test("another member of the same household sees it too — a shared inbox, not a personal one", () => {
  assert.equal(asProfile(OTHER_ADULT, `select count(*) from public.home_send_items;`, options), "1");
});

test("another household sees nothing at all", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.home_send_items;`, options), "0");
});

test("a member cannot send something into another household", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text)
       values ('${otherHousehold}', '${headMember}', 'pasted_text', 'Planted');`,
      options,
    ),
    "an item was inserted into a household the sender does not belong to",
  );
});

test("a member cannot claim to be someone else's sender", () => {
  assert.ok(
    deniedForProfile(
      OTHER_ADULT,
      `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text)
       values ('${household}', '${headMember}', 'pasted_text', 'Impersonated');`,
      options,
    ),
    "a member inserted an intake item attributed to someone else",
  );
});

test("an upload needs a file path, and pasted text needs the text", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.home_send_items (household_id, created_by_member_id, source)
       values ('${household}', '${headMember}', 'manual_upload');`,
      options,
    ),
    "a manual_upload row was accepted with no file_path",
  );
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.home_send_items (household_id, created_by_member_id, source)
       values ('${household}', '${headMember}', 'pasted_text');`,
      options,
    ),
    "a pasted_text row was accepted with no raw_text",
  );
});

test("routing needs both a table and an id, or neither", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.home_send_items set routed_table = 'obligations' where id = '${itemId}';`,
      options,
    ),
    "a routed_table was accepted with no routed_id",
  );
});

test("a routed row's status must actually say routed", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.home_send_items
         set routed_table = 'obligations', routed_id = '${itemId}'
       where id = '${itemId}';`,
      options,
    ),
    "a route was recorded without the status moving to routed",
  );
});

test("any household member may classify and route a shared item", () => {
  asProfile(
    OTHER_ADULT,
    `update public.home_send_items
       set status = 'classified', classified_kind = 'bill', extracted = '{"title": "Electricity bill"}'::jsonb
     where id = '${itemId}';`,
    options,
  );
  assert.equal(psql(`select status from public.home_send_items where id = '${itemId}';`, options), "classified");

  const obligationId = psql(
    `insert into public.obligations (household_id, name, kind) values ('${household}', 'Electricity bill', 'utility') returning id;`,
    options,
  );
  asProfile(
    HEAD,
    `update public.home_send_items
       set status = 'routed', routed_table = 'obligations', routed_id = '${obligationId}'
     where id = '${itemId}';`,
    options,
  );
  assert.equal(psql(`select status from public.home_send_items where id = '${itemId}';`, options), "routed");
});

test("an outsider cannot touch another household's intake item", () => {
  // An UPDATE with no matching RLS policy does not throw — Postgres just
  // matches zero rows (see the gotcha documented in lib/db.mjs) — so this
  // has to re-read the row rather than rely on a caught exception.
  assert.ok(
    deniedForUpdate(
      OUTSIDER,
      `update public.home_send_items set status = 'dismissed' where id = '${itemId}';`,
      `select status from public.home_send_items where id = '${itemId}';`,
      "routed",
      options,
    ),
    "an outsider could change the status of another household's intake item",
  );
});
