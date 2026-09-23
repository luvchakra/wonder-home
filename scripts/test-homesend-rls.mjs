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

test("the same record is only recorded once per intake", () => {
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

// ---------------------------------------------------------------------------
// Phase 3: a second, different-domain change on the same intake (a bill that
// also implies a grocery item) — one change per record per intake
// (homesend_changes_one_per_intake_record, Wave 3 §11).
// ---------------------------------------------------------------------------

let thirdItemId = "";
let thirdBillChangeId = "";
let thirdGroceryChangeId = "";

test("a second write to a different domain on the same intake is allowed", () => {
  thirdItemId = asProfile(
    HEAD,
    `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text)
     values ('${household}', '${headMember}', 'pasted_text', 'School notice: bring Rs 500 and a glue stick')
     returning id;`,
    options,
  );
  const thirdObligationId = psql(
    `insert into public.obligations (household_id, name, kind) values ('${household}', 'School fee', 'school_fee') returning id;`,
    options,
  );
  thirdBillChangeId = asProfile(
    HEAD,
    `insert into public.homesend_changes (household_id, intake_id, domain, entity_id, created_by_member_id)
     values ('${household}', '${thirdItemId}', 'bill', '${thirdObligationId}', '${headMember}')
     returning id;`,
    options,
  );
  assert.ok(thirdBillChangeId.length > 0);

  const consumableId = psql(
    `insert into public.consumables (household_id, name, category, unit) values ('${household}', 'Glue stick', 'household', 'unit') returning id;`,
    options,
  );
  thirdGroceryChangeId = asProfile(
    HEAD,
    `insert into public.homesend_changes (household_id, intake_id, domain, entity_id, created_by_member_id)
     values ('${household}', '${thirdItemId}', 'grocery_item', '${consumableId}', '${headMember}')
     returning id;`,
    options,
  );
  assert.ok(thirdGroceryChangeId.length > 0);
});

test("the same record written twice by that intake is still refused", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.homesend_changes (household_id, intake_id, domain, entity_id, created_by_member_id)
       select household_id, intake_id, domain, entity_id, created_by_member_id from public.homesend_changes where id = '${thirdGroceryChangeId}';`,
      options,
    ),
    "the same record was recorded twice for one intake",
  );
});

test("undoing only the secondary change leaves the primary change active", () => {
  asProfile(
    HEAD,
    `update public.homesend_changes set undone_at = now(), undone_by_member_id = '${headMember}' where id = '${thirdGroceryChangeId}';`,
    options,
  );
  assert.equal(
    psql(
      `select count(*) from public.homesend_changes where intake_id = '${thirdItemId}' and undone_at is null;`,
      options,
    ),
    "1",
  );
  assert.equal(
    psql(`select undone_at is null from public.homesend_changes where id = '${thirdBillChangeId}';`, options),
    "t",
  );
});

// ---------------------------------------------------------------------------
// Phase 4: the PWA Web Share Target's signed-out handoff --
// homesend_share_handoffs. No household is known when a row is written, so
// every write and read here goes through psql (the admin-equivalent
// connection) directly, exactly as the real handoff code always uses the
// admin client -- there is no session to scope a request-bound client to.
// ---------------------------------------------------------------------------

test("a text handoff can be staged and read back by the admin connection", () => {
  const id = psql(
    `insert into public.homesend_share_handoffs (token, kind, raw_text)
     values ('tok-text-1', 'text', 'A shared bill reminder') returning id;`,
    options,
  );
  assert.ok(id.length > 0);
  assert.equal(
    psql(`select raw_text from public.homesend_share_handoffs where token = 'tok-text-1';`, options),
    "A shared bill reminder",
  );
});

test("no signed-in caller, however privileged, can read a staged handoff", () => {
  assert.equal(asProfile(HEAD, `select count(*) from public.homesend_share_handoffs;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.homesend_share_handoffs;`, options), "0");
});

test("a text handoff cannot also carry file content", () => {
  let threw = false;
  try {
    psql(
      `insert into public.homesend_share_handoffs (token, kind, raw_text, file_bytes)
       values ('tok-bad-1', 'text', 'Text', '\\x00');`,
      options,
    );
  } catch {
    threw = true;
  }
  assert.ok(threw, "a text handoff was accepted with file content attached");
});

test("a file handoff needs both its bytes and a content type", () => {
  let threw = false;
  try {
    psql(
      `insert into public.homesend_share_handoffs (token, kind, file_bytes)
       values ('tok-bad-2', 'file', '\\x89504e47');`,
      options,
    );
  } catch {
    threw = true;
  }
  assert.ok(threw, "a file handoff was accepted with no content type");
});

test("a file handoff round-trips its bytes and content type", () => {
  psql(
    `insert into public.homesend_share_handoffs (token, kind, file_bytes, file_content_type)
     values ('tok-file-1', 'file', '\\x89504e47', 'image/png');`,
    options,
  );
  assert.equal(
    psql(`select file_content_type from public.homesend_share_handoffs where token = 'tok-file-1';`, options),
    "image/png",
  );
});

test("two handoffs cannot share the same token", () => {
  let threw = false;
  try {
    psql(
      `insert into public.homesend_share_handoffs (token, kind, raw_text)
       values ('tok-text-1', 'text', 'A different message');`,
      options,
    );
  } catch {
    threw = true;
  }
  assert.ok(threw, "a second handoff was created with an already-used token");
});

// ---------------------------------------------------------------------------
// Phase 6 hardening: ip_hash rate-limit column on homesend_share_handoffs.
// ---------------------------------------------------------------------------

test("a handoff can carry an ip_hash for rate limiting, and it counts toward that hash", () => {
  psql(
    `insert into public.homesend_share_handoffs (token, kind, raw_text, ip_hash)
     values ('tok-iphash-1', 'text', 'From a rate-limited caller', 'deadbeef1');`,
    options,
  );
  psql(
    `insert into public.homesend_share_handoffs (token, kind, raw_text, ip_hash)
     values ('tok-iphash-2', 'text', 'Another from the same caller', 'deadbeef1');`,
    options,
  );
  assert.equal(
    psql(`select count(*) from public.homesend_share_handoffs where ip_hash = 'deadbeef1';`, options),
    "2",
  );
});

test("ip_hash is optional — a handoff with none is still staged and read back normally", () => {
  psql(
    `insert into public.homesend_share_handoffs (token, kind, raw_text)
     values ('tok-iphash-none', 'text', 'No identifiable caller');`,
    options,
  );
  assert.equal(
    psql(`select ip_hash is null from public.homesend_share_handoffs where token = 'tok-iphash-none';`, options),
    "t",
  );
});

function otherAdultMember() {
  return psql(
    `select id from public.household_members where household_id = '${household}' and profile_id = '${OTHER_ADULT}';`,
    options,
  );
}

// ---------------------------------------------------------------------------
// Wave 3 (story 14-011): every input type in one table, one canonical
// understanding, and an inbox that says what failed safely.
// ---------------------------------------------------------------------------

function refused(sql, asHead = true) {
  try {
    if (asHead) asProfile(HEAD, sql, options);
    else psql(sql, options);
    return false;
  } catch {
    return true;
  }
}

const HASH = "a".repeat(64);

test("a member can send a link, a voice note or a PDF — each with the content its source needs", () => {
  const link = asProfile(
    HEAD,
    `insert into public.home_send_items (household_id, created_by_member_id, source, source_url, content_hash)
     values ('${household}', '${headMember}', 'link', 'https://school.example.org/notice', '${HASH}') returning id;`,
    options,
  );
  const voice = asProfile(
    HEAD,
    `insert into public.home_send_items (household_id, created_by_member_id, source, file_path, content_type, transcript_confidence)
     values ('${household}', '${headMember}', 'audio_note', '${household}/voice-1', 'audio/webm', 0.82) returning id;`,
    options,
  );
  const pdf = asProfile(
    HEAD,
    `insert into public.home_send_items (household_id, created_by_member_id, source, file_path, content_type)
     values ('${household}', '${headMember}', 'manual_upload', '${household}/circular.pdf', 'application/pdf') returning id;`,
    options,
  );
  assert.ok(link && voice && pdf);
});

test("a link needs its address, and a voice note needs its recording", () => {
  assert.ok(refused(`insert into public.home_send_items (household_id, created_by_member_id, source, raw_text) values ('${household}', '${headMember}', 'link', 'no address');`), "a link without source_url was accepted");
  assert.ok(refused(`insert into public.home_send_items (household_id, created_by_member_id, source, raw_text) values ('${household}', '${headMember}', 'audio_note', 'no recording');`), "a voice note without a file was accepted");
});

test("a failed item must say why, and the reason must be one the inbox can put into words", () => {
  assert.ok(refused(`insert into public.home_send_items (household_id, created_by_member_id, source, raw_text, status) values ('${household}', '${headMember}', 'pasted_text', 'x', 'failed');`), "a failed item with no reason was accepted");
  assert.ok(
    refused(`insert into public.home_send_items (household_id, created_by_member_id, source, raw_text, status, failure_reason) values ('${household}', '${headMember}', 'pasted_text', 'x', 'failed', 'because');`),
    "an unknown failure reason was accepted",
  );
  const id = asProfile(
    HEAD,
    `insert into public.home_send_items (household_id, created_by_member_id, source, source_url, status, failure_reason)
     values ('${household}', '${headMember}', 'link', 'http://169.254.169.254/', 'failed', 'link_blocked') returning id;`,
    options,
  );
  assert.ok(id.length > 0);
});

test("a failed item can still be dismissed, keeping why it failed", () => {
  const id = asProfile(
    HEAD,
    `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text, status, failure_reason)
     values ('${household}', '${headMember}', 'pasted_text', 'unreadable scan', 'failed', 'unreadable') returning id;`,
    options,
  );
  asProfile(OTHER_ADULT, `update public.home_send_items set status = 'dismissed' where id = '${id}';`, options);
  assert.equal(psql(`select status || ':' || failure_reason from public.home_send_items where id = '${id}';`, options), "dismissed:unreadable");
});

test("a content hash must be a real sha256, and the same content can be looked up in one household", () => {
  assert.ok(refused(`insert into public.home_send_items (household_id, created_by_member_id, source, raw_text, content_hash) values ('${household}', '${headMember}', 'pasted_text', 'x', 'not-a-hash');`), "a malformed content hash was accepted");
  assert.equal(
    asProfile(HEAD, `select count(*) from public.home_send_items where household_id = '${household}' and content_hash = '${HASH}';`, options),
    "1",
  );
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.home_send_items where content_hash = '${HASH}';`, options), "0");
});

test("the canonical understanding round-trips, and a transcript confidence stays between 0 and 1", () => {
  const id = asProfile(
    HEAD,
    `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text, understanding)
     values ('${household}', '${headMember}', 'pasted_text', 'Sports Day is Saturday',
             '{"readable": true, "kind": "school_item", "safety": {"instructionsIgnored": false, "signals": []}}'::jsonb) returning id;`,
    options,
  );
  assert.equal(psql(`select understanding->>'kind' from public.home_send_items where id = '${id}';`, options), "school_item");
  assert.ok(
    refused(`insert into public.home_send_items (household_id, created_by_member_id, source, file_path, transcript_confidence) values ('${household}', '${headMember}', 'audio_note', 'p/v', 1.5);`),
    "a transcript confidence above 1 was accepted",
  );
});

test("a page's worth of text fits; more than the understanding step reads does not", () => {
  const long = "a".repeat(11000);
  const id = asProfile(HEAD, `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text) values ('${household}', '${headMember}', 'pasted_text', '${long}') returning id;`, options);
  assert.ok(id.length > 0);
  assert.ok(refused(`insert into public.home_send_items (household_id, created_by_member_id, source, raw_text) values ('${household}', '${headMember}', 'pasted_text', '${"a".repeat(12001)}');`), "text over 12,000 characters was accepted");
});

test("an email attachment belongs to its email and, like the email, to no acting member", () => {
  const email = psql(
    `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text, external_id)
     values ('${household}', null, 'email', 'See the attached circular', 'ext-attach-parent') returning id;`,
    options,
  );
  const attachment = psql(
    `insert into public.home_send_items (household_id, created_by_member_id, source, file_path, parent_item_id, external_id, content_type)
     values ('${household}', null, 'email_attachment', '${household}/attach-1', '${email}', 'ext-attach-parent:att-1', 'application/pdf') returning id;`,
    options,
  );
  assert.ok(attachment.length > 0);
  assert.ok(
    refused(`insert into public.home_send_items (household_id, created_by_member_id, source, file_path) values ('${household}', null, 'email_attachment', 'x/y');`, false),
    "an attachment with no parent email was accepted",
  );
  assert.ok(
    refused(`insert into public.home_send_items (household_id, created_by_member_id, source, file_path, parent_item_id) values ('${household}', '${headMember}', 'email_attachment', 'x/y', '${email}');`),
    "a member was able to claim to have sent an email attachment",
  );
  assert.ok(
    refused(`insert into public.home_send_items (household_id, created_by_member_id, source, raw_text, parent_item_id) values ('${household}', '${headMember}', 'pasted_text', 'x', '${email}');`),
    "a non-attachment was given a parent",
  );
});

test("a share handoff can stage a PDF or a voice note, not only a photo", () => {
  psql(
    `insert into public.homesend_share_handoffs (token, kind, file_bytes, file_content_type)
     values ('tok-pdf-1', 'file', '\\x255044462d', 'application/pdf');`,
    options,
  );
  assert.equal(psql(`select file_content_type from public.homesend_share_handoffs where token = 'tok-pdf-1';`, options), "application/pdf");
});

// ---------------------------------------------------------------------------
// Wave 3 §10, §11: a routed item can update or cancel a record already on
// record (and undo puts back exactly what it replaced), and one notice can
// write two different grocery needs.
// ---------------------------------------------------------------------------

function newIntake(text) {
  return asProfile(
    HEAD,
    `insert into public.home_send_items (household_id, created_by_member_id, source, raw_text)
     values ('${household}', '${headMember}', 'pasted_text', '${text}') returning id;`,
    options,
  );
}

test("an existing change row reads as 'created' with nothing it replaced", () => {
  assert.equal(psql(`select change_type || ':' || coalesce(previous::text, 'null') from public.homesend_changes where id = '${changeId}';`, options), "created:null");
});

test("an update records what it replaced, and a cancellation too", () => {
  const moved = newIntake("Science Exhibition moved to 29 September");
  const exhibition = psql(`insert into public.obligations (household_id, name, kind, due_on) values ('${household}', 'Exhibition fee', 'school_fee', '2026-09-28') returning id;`, options);
  const updated = asProfile(
    HEAD,
    `insert into public.homesend_changes (household_id, intake_id, domain, entity_id, created_by_member_id, change_type, previous)
     values ('${household}', '${moved}', 'bill', '${exhibition}', '${headMember}', 'updated', '{"dueOn": "2026-09-28"}'::jsonb) returning id;`,
    options,
  );
  assert.equal(psql(`select previous->>'dueOn' from public.homesend_changes where id = '${updated}';`, options), "2026-09-28");

  const called = newIntake("Sports Day is cancelled");
  const cancelled = asProfile(
    HEAD,
    `insert into public.homesend_changes (household_id, intake_id, domain, entity_id, created_by_member_id, change_type, previous)
     values ('${household}', '${called}', 'bill', '${exhibition}', '${headMember}', 'cancelled', '{"status": "received"}'::jsonb) returning id;`,
    options,
  );
  assert.ok(cancelled.length > 0);
});

test("an update or cancellation must say what it replaced, and a creation must not", () => {
  const intake = newIntake("Fee revised");
  const record = psql(`insert into public.obligations (household_id, name, kind) values ('${household}', 'Revised fee', 'school_fee') returning id;`, options);
  const insert = (type, previous) =>
    `insert into public.homesend_changes (household_id, intake_id, domain, entity_id, created_by_member_id, change_type, previous)
     values ('${household}', '${intake}', 'bill', '${record}', '${headMember}', '${type}', ${previous});`;
  assert.ok(deniedForProfile(HEAD, insert("updated", "null"), options), "an update with nothing it replaced was accepted");
  assert.ok(deniedForProfile(HEAD, insert("cancelled", "null"), options), "a cancellation with nothing it replaced was accepted");
  assert.ok(deniedForProfile(HEAD, insert("created", `'{"dueOn": "2026-09-28"}'::jsonb`), options), "a creation claiming to replace something was accepted");
  assert.ok(deniedForProfile(HEAD, insert("deleted", `'{}'::jsonb`), options), "an unknown change type was accepted");
});

test("one notice can add two different grocery needs, each undone on its own", () => {
  const notice = newIntake("Sports Day: bring a white T-shirt and sports shoes");
  const [shirt, shoes] = ["White T-shirt", "Sports shoes"].map((name) =>
    psql(`insert into public.consumables (household_id, name, category, unit) values ('${household}', '${name}', 'household', 'unit') returning id;`, options),
  );
  const [shirtChange] = [shirt, shoes].map((consumable) =>
    asProfile(
      HEAD,
      `insert into public.homesend_changes (household_id, intake_id, domain, entity_id, created_by_member_id)
       values ('${household}', '${notice}', 'grocery_item', '${consumable}', '${headMember}') returning id;`,
      options,
    ),
  );
  asProfile(HEAD, `update public.homesend_changes set undone_at = now(), undone_by_member_id = '${headMember}' where id = '${shirtChange}';`, options);
  assert.equal(psql(`select count(*) from public.homesend_changes where intake_id = '${notice}' and undone_at is null;`, options), "1");
});
