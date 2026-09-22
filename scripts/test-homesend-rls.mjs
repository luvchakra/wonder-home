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

// ---------------------------------------------------------------------------
// Phase 1: security_status, the "undone" status, and homesend_changes/undo.
// ---------------------------------------------------------------------------

test("an upload defaults to not_applicable security status", () => {
  const uploadId = asProfile(
    HEAD,
    `insert into public.home_send_items (household_id, created_by_member_id, source, file_path)
     values ('${household}', '${headMember}', 'manual_upload', '${household}/some-file')
     returning id;`,
    options,
  );
  assert.equal(
    psql(`select security_status from public.home_send_items where id = '${uploadId}';`, options),
    "not_applicable",
  );
});

test("security_status only accepts the three real values", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text, security_status)
       values ('${household}', '${headMember}', 'pasted_text', 'Planted', 'infected');`,
      options,
    ),
    "an invalid security_status was accepted",
  );
});

let obligationId = "";

test("routing writes a real domain row (so undo has something to reverse)", () => {
  obligationId = psql(
    `insert into public.obligations (household_id, name, kind) values ('${household}', 'Water bill', 'utility') returning id;`,
    options,
  );
  assert.ok(obligationId.length > 0);
});

let changeId = "";

test("any household member may record what routing wrote", () => {
  changeId = asProfile(
    OTHER_ADULT,
    `insert into public.homesend_changes (household_id, intake_id, domain, entity_id, created_by_member_id)
     values ('${household}', '${itemId}', 'bill', '${obligationId}', '${otherAdultMember()}')
     returning id;`,
    options,
  );
  assert.ok(changeId.length > 0);
});

test("a member cannot record a change attributed to someone else", () => {
  assert.ok(
    deniedForProfile(
      OTHER_ADULT,
      `insert into public.homesend_changes (household_id, intake_id, domain, entity_id, created_by_member_id)
       values ('${household}', '${itemId}', 'bill', '${obligationId}', '${headMember}');`,
      options,
    ),
    "a member recorded a change attributed to another member",
  );
});

test("only one change per intake", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.homesend_changes (household_id, intake_id, domain, entity_id, created_by_member_id)
       values ('${household}', '${itemId}', 'bill', '${obligationId}', '${headMember}');`,
      options,
    ),
    "a second change was recorded for the same intake item",
  );
});

test("another household cannot see this household's changes", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.homesend_changes;`, options), "0");
});

test("undone_at and undone_by_member_id must arrive together", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.homesend_changes set undone_at = now() where id = '${changeId}';`,
      options,
    ),
    "undone_at was accepted with no undone_by_member_id",
  );
});

test("any household member can undo a shared change, attributing it to themselves", () => {
  asProfile(
    HEAD,
    `update public.homesend_changes
       set undone_at = now(), undone_by_member_id = '${headMember}'
     where id = '${changeId}';`,
    options,
  );
  asProfile(
    HEAD,
    `update public.home_send_items set status = 'undone' where id = '${itemId}';`,
    options,
  );
  assert.equal(psql(`select status from public.home_send_items where id = '${itemId}';`, options), "undone");
});

test("a change already undone cannot be undone again", () => {
  // The USING clause (`undone_at is null`) matches zero rows here, which
  // does not throw — see lib/db.mjs's documented gotcha — so this has to
  // re-read the row rather than rely on a caught exception.
  assert.ok(
    deniedForUpdate(
      OTHER_ADULT,
      `update public.homesend_changes set undone_at = now(), undone_by_member_id = '${otherAdultMember()}' where id = '${changeId}';`,
      `select undone_by_member_id from public.homesend_changes where id = '${changeId}';`,
      headMember,
      options,
    ),
    "a change already marked undone was updated again",
  );
});

test("a member cannot attribute an undo to someone else", () => {
  const secondItemId = asProfile(
    HEAD,
    `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text)
     values ('${household}', '${headMember}', 'pasted_text', 'A second thing sent in')
     returning id;`,
    options,
  );
  const secondObligationId = psql(
    `insert into public.obligations (household_id, name, kind) values ('${household}', 'Gas bill', 'utility') returning id;`,
    options,
  );
  const secondChangeId = asProfile(
    HEAD,
    `insert into public.homesend_changes (household_id, intake_id, domain, entity_id, created_by_member_id)
     values ('${household}', '${secondItemId}', 'bill', '${secondObligationId}', '${headMember}')
     returning id;`,
    options,
  );
  assert.ok(
    deniedForProfile(
      OTHER_ADULT,
      `update public.homesend_changes
         set undone_at = now(), undone_by_member_id = '${headMember}'
       where id = '${secondChangeId}';`,
      options,
    ),
    "a member attributed an undo to another member",
  );
});

// ---------------------------------------------------------------------------
// Phase 2: email intake — homesend_addresses, and home_send_items widened
// for a source with no acting household member.
// ---------------------------------------------------------------------------

test("an email-sourced item needs no acting member, and gets one only via the admin client", () => {
  const emailItemId = psql(
    `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text, external_id, sender_address)
     values ('${household}', null, 'email', 'A forwarded school notice', 'ext-msg-1', 'school@example.test')
     returning id;`,
    options,
  );
  assert.ok(emailItemId.length > 0);
  assert.equal(
    psql(`select created_by_member_id is null from public.home_send_items where id = '${emailItemId}';`, options),
    "t",
  );
});

test("an email-sourced item cannot name an acting member", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text)
       values ('${household}', '${headMember}', 'email', 'Should be rejected');`,
      options,
    ),
    "an email-sourced item was accepted with an acting member",
  );
});

test("a non-email item still requires an acting member", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text)
       values ('${household}', null, 'pasted_text', 'Should be rejected');`,
      options,
    ),
    "a pasted_text item was accepted with no acting member",
  );
});

test("the same provider message id cannot create two intake rows for one household", () => {
  let threw = false;
  try {
    psql(
      `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text, external_id)
       values ('${household}', null, 'email', 'A duplicate delivery', 'ext-msg-1');`,
      options,
    );
  } catch {
    threw = true;
  }
  assert.ok(threw, "a second intake row was created for an external_id already seen by this household");
});

test("the same provider message id is fine again in a different household", () => {
  const id = psql(
    `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text, external_id)
     values ('${otherHousehold}', null, 'email', 'Unrelated', 'ext-msg-1')
     returning id;`,
    options,
  );
  assert.ok(id.length > 0);
});

let addressId = "";

test("an admin can set up the household's HomeSend address", () => {
  addressId = asProfile(
    HEAD,
    `insert into public.homesend_addresses (household_id, address) values ('${household}', 'hs-testtoken@inbox.example.test') returning id;`,
    options,
  );
  assert.ok(addressId.length > 0);
});

test("a non-admin member can read the address but not create one", () => {
  assert.equal(asProfile(OTHER_ADULT, `select count(*) from public.homesend_addresses;`, options), "1");
  assert.ok(
    deniedForProfile(
      OTHER_ADULT,
      `insert into public.homesend_addresses (household_id, address) values ('${household}', 'hs-shouldfail@inbox.example.test');`,
      options,
    ),
    "a non-admin created a HomeSend address",
  );
});

test("a household may only have one address", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.homesend_addresses (household_id, address) values ('${household}', 'hs-second@inbox.example.test');`,
      options,
    ),
    "a second address was created for a household that already has one",
  );
});

test("a non-admin cannot rotate or revoke the address", () => {
  // An UPDATE with no matching RLS policy silently matches zero rows rather
  // than throwing (lib/db.mjs's documented gotcha) — deniedForUpdate re-reads
  // the row rather than trusting a caught exception that never comes.
  assert.ok(
    deniedForUpdate(
      OTHER_ADULT,
      `update public.homesend_addresses set address = 'hs-rotated@inbox.example.test', rotated_at = now() where id = '${addressId}';`,
      `select address from public.homesend_addresses where id = '${addressId}';`,
      "hs-testtoken@inbox.example.test",
      options,
    ),
    "a non-admin rotated the HomeSend address",
  );
});

test("an admin can rotate the address", () => {
  asProfile(
    HEAD,
    `update public.homesend_addresses set address = 'hs-rotated@inbox.example.test', rotated_at = now() where id = '${addressId}';`,
    options,
  );
  assert.equal(psql(`select address from public.homesend_addresses where id = '${addressId}';`, options), "hs-rotated@inbox.example.test");
});

test("a revoked address does not resolve — the exact lookup the email webhook makes", () => {
  asProfile(
    HEAD,
    `update public.homesend_addresses set status = 'revoked', revoked_at = now() where id = '${addressId}';`,
    options,
  );
  assert.equal(
    psql(
      `select count(*) from public.homesend_addresses where address = 'hs-rotated@inbox.example.test' and status = 'active';`,
      options,
    ),
    "0",
  );
});

test("another household cannot see this household's HomeSend address", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.homesend_addresses;`, options), "0");
});

function otherAdultMember() {
  return psql(
    `select id from public.household_members where household_id = '${household}' and profile_id = '${OTHER_ADULT}';`,
    options,
  );
}
