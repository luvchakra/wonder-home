#!/usr/bin/env node
/**
 * WhatsApp as a HomeSend intake channel, at the database (the WhatsApp
 * HomeSend spec §10–§11, §18–§19).
 *
 * - A number becomes a member's only through a code issued to that member:
 *   public.complete_whatsapp_link is the server's alone, single-use and
 *   time-limited, and never links one number to two members.
 * - Only an adult can hold a link or a code.
 * - A member sees their own link and number; an admin sees the household's;
 *   another member only learns who is connected; another household sees
 *   nothing.
 * - No session writes a link, a code, a message or an event; a person only
 *   ever disconnects, and disconnecting keeps the row and everything made
 *   from it.
 * - An inbound message can only belong to the linked identity's household
 *   and member, and is kept once per WhatsApp message id.
 * - HomeSend takes the two new sources, each with a member.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_whatsapp_test";
const options = { database: DB };

const KUNAL = "61111111-1111-4111-8111-111111111111";
const PRIYA = "62222222-2222-4222-8222-222222222222";
const ARJUN = "63333333-3333-4333-8333-333333333333";
const HELPER = "64444444-4444-4444-8444-444444444444";
const HASH = (n) => String(n).repeat(64).slice(0, 64);

let household = "";
let otherHousehold = "";
let kunal = "";
let priya = "";
let arjun = "";
let helper = "";
let aarav = "";

const code = (householdId, memberId, hash, expires = "now() + interval '15 minutes'") =>
  psql(`insert into public.whatsapp_link_requests (household_id, member_id, token_hash, expires_at) values ('${householdId}', '${memberId}', '${hash}', ${expires}) returning id;`, options);
const complete = (hash, waUser, name = "") =>
  psql(`select outcome || ' ' || coalesce(member_id::text, '-') from public.complete_whatsapp_link('${hash}', '${waUser}', '+${waUser}', '${name}');`, options);

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${KUNAL}', 'kunal@example.test'), ('${PRIYA}', 'priya@example.test'), ('${ARJUN}', 'arjun@example.test'), ('${HELPER}', 'lata@example.test');`, options);
  [household, kunal] = asProfile(KUNAL, `select household_id || ' ' || member_id from wh.create_household('Mehta Home', 'Kunal');`, options).split(" ");
  [otherHousehold, arjun] = asProfile(ARJUN, `select household_id || ' ' || member_id from wh.create_household('Arjun Home', 'Arjun');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${PRIYA}', 'Priya'), ('${HELPER}', 'Lata');`, options);
  priya = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${PRIYA}', 'adult', 'Priya') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${priya}', 'adult');`, options);
  helper = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${HELPER}', 'helper', 'Lata') returning id;`, options);
  aarav = psql(`insert into public.household_members (household_id, member_type, display_name) values ('${household}', 'child', 'Aarav') returning id;`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a code links the number that sent it to the member it was issued to, once", () => {
  code(household, kunal, HASH(1));
  assert.equal(complete(HASH(1), "919800000001", "Kunal"), `linked ${kunal}`);
  // The same code again: used.
  assert.equal(complete(HASH(1), "919800000001"), `expired ${kunal}`);
  // A code nobody issued.
  assert.equal(complete(HASH(9), "919800000009"), "invalid -");
  assert.equal(psql(`select member_id || ' ' || household_id || ' ' || phone_number || ' ' || display_name from public.whatsapp_identities where wa_user_id = '919800000001' and status = 'active';`, options), `${kunal} ${household} +919800000001 Kunal`);
});

test("a second adult links their own number to the same household", () => {
  code(household, priya, HASH(2));
  assert.equal(complete(HASH(2), "919800000002"), `linked ${priya}`);
  assert.equal(psql(`select count(*) from public.whatsapp_identities where household_id = '${household}' and status = 'active';`, options), "2");
});

test("one number is never linked to two members, and an expired code links nothing", () => {
  // Arjun, in another household, tries to claim Kunal's number with his own code.
  code(otherHousehold, arjun, HASH(3));
  assert.equal(complete(HASH(3), "919800000001"), `in_use ${arjun}`);
  assert.equal(psql(`select member_id from public.whatsapp_identities where wa_user_id = '919800000001' and status = 'active';`, options), kunal);
  // And even a direct insert of a second active link for that number is refused.
  assert.throws(() => psql(`insert into public.whatsapp_identities (household_id, member_id, wa_user_id, phone_number) values ('${otherHousehold}', '${arjun}', '919800000001', '+919800000001');`, options), /whatsapp_identities_active_number/);

  psql(`insert into public.whatsapp_link_requests (household_id, member_id, token_hash, created_at, expires_at) values ('${otherHousehold}', '${arjun}', '${HASH(4)}', now() - interval '20 minutes', now() - interval '5 minutes');`, options);
  assert.equal(complete(HASH(4), "919800000004"), `expired ${arjun}`);
  assert.equal(psql(`select count(*) from public.whatsapp_identities where member_id = '${arjun}';`, options), "0");
});

test("only an adult holds a code or a link", () => {
  assert.throws(() => code(household, aarav, HASH(5)), /not an adult/);
  assert.throws(() => code(household, helper, HASH(6)), /not an adult/);
  assert.throws(() => psql(`insert into public.whatsapp_identities (household_id, member_id, wa_user_id, phone_number) values ('${household}', '${aarav}', '919800000005', '+919800000005');`, options), /not an adult/);
  // Nor a member of another household.
  assert.throws(() => code(household, arjun, HASH(7)), /not an adult/);
});

test("a member sees their own number, an admin the household's, another household nothing", () => {
  assert.equal(asProfile(PRIYA, `select phone_number from public.whatsapp_identities where status = 'active';`, options), "+919800000002");
  assert.equal(asProfile(KUNAL, `select count(*) from public.whatsapp_identities where status = 'active';`, options), "2");
  assert.equal(asProfile(ARJUN, `select count(*) from public.whatsapp_identities;`, options), "0");
  // Every member learns who is connected — ids only, never a number.
  assert.equal(asProfile(PRIYA, `select count(*) from public.household_whatsapp_members('${household}');`, options), "2");
  assert.equal(asProfile(ARJUN, `select count(*) from public.household_whatsapp_members('${household}');`, options), "0");
});

test("no session writes a link, a code, a message or an event, or completes a link", () => {
  assert.ok(deniedForProfile(PRIYA, `insert into public.whatsapp_identities (household_id, member_id, wa_user_id, phone_number) values ('${household}', '${priya}', '919800000077', '+919800000077');`, options));
  asProfile(PRIYA, `update public.whatsapp_identities set member_id = '${kunal}', wa_user_id = '919800000099' where member_id = '${priya}';`, options);
  assert.equal(psql(`select wa_user_id from public.whatsapp_identities where member_id = '${priya}' and status = 'active';`, options), "919800000002");
  assert.ok(deniedForProfile(PRIYA, `insert into public.whatsapp_link_requests (household_id, member_id, token_hash, expires_at) values ('${household}', '${priya}', '${HASH(8)}', now() + interval '10 minutes');`, options));
  assert.equal(asProfile(KUNAL, `select count(*) from public.whatsapp_link_requests;`, options), "0");
  assert.equal(asProfile(KUNAL, `select count(*) from public.whatsapp_events;`, options), "0");
  assert.ok(deniedForProfile(KUNAL, `insert into public.whatsapp_events (kind) values ('message_received');`, options));
  assert.ok(deniedForProfile(PRIYA, `select * from public.complete_whatsapp_link('${HASH(2)}', '919800000055', '+919800000055', '');`, options), "a session completed a link");
});

test("an inbound message belongs to its linked identity's household and member, once per WhatsApp id", () => {
  const identity = psql(`select id from public.whatsapp_identities where member_id = '${priya}' and status = 'active';`, options);
  const insert = (id, householdId, memberId) =>
    psql(`insert into public.whatsapp_messages (provider_message_id, identity_id, household_id, member_id, message_type, text_content, received_at) values ('${id}', '${identity}', '${householdId}', '${memberId}', 'text', 'Sports Day tomorrow', now()) returning id;`, options);
  insert("wamid.A1", household, priya);
  assert.throws(() => insert("wamid.A1", household, priya), /duplicate key/);
  assert.throws(() => insert("wamid.A2", otherHousehold, priya), /linked identity/);
  assert.throws(() => insert("wamid.A3", household, kunal), /linked identity/);
  // The sender and an admin see its record; nobody else does, and nobody writes it.
  assert.equal(asProfile(PRIYA, `select count(*) from public.whatsapp_messages;`, options), "1");
  assert.equal(asProfile(KUNAL, `select count(*) from public.whatsapp_messages;`, options), "1");
  assert.equal(asProfile(ARJUN, `select count(*) from public.whatsapp_messages;`, options), "0");
  assert.ok(deniedForProfile(PRIYA, `insert into public.whatsapp_messages (provider_message_id, identity_id, household_id, member_id, message_type, text_content, received_at) values ('wamid.A4', '${identity}', '${household}', '${priya}', 'text', 'x', now());`, options));
});

test("HomeSend takes WhatsApp items, each from a member", () => {
  psql(`insert into public.home_send_items (household_id, created_by_member_id, source, raw_text, external_id) values ('${household}', '${priya}', 'whatsapp', 'Sports Day tomorrow', 'whatsapp:wamid.A1');`, options);
  psql(`insert into public.home_send_items (household_id, created_by_member_id, source, file_path, security_status, external_id) values ('${household}', '${priya}', 'whatsapp_media', '${household}/x', 'clean', 'whatsapp:wamid.A5');`, options);
  assert.throws(() => psql(`insert into public.home_send_items (household_id, created_by_member_id, source, raw_text) values ('${household}', null, 'whatsapp', 'no sender');`, options), /home_send_items_actor_matches_source/);
  assert.throws(() => psql(`insert into public.home_send_items (household_id, created_by_member_id, source, raw_text) values ('${household}', '${priya}', 'whatsapp_media', 'no file');`, options), /home_send_items_has_content/);
  // A retried delivery is one item.
  assert.throws(() => psql(`insert into public.home_send_items (household_id, created_by_member_id, source, raw_text, external_id) values ('${household}', '${priya}', 'whatsapp', 'again', 'whatsapp:wamid.A1');`, options), /duplicate key/);
  // Every member of the household sees it; another household doesn't.
  assert.equal(asProfile(KUNAL, `select count(*) from public.home_send_items where source like 'whatsapp%';`, options), "2");
  assert.equal(asProfile(ARJUN, `select count(*) from public.home_send_items;`, options), "0");
});

test("disconnecting is the member's or an admin's, keeps the row, and deletes nothing made from it", () => {
  const priyaLink = psql(`select id from public.whatsapp_identities where member_id = '${priya}' and status = 'active';`, options);
  const kunalLink = psql(`select id from public.whatsapp_identities where member_id = '${kunal}' and status = 'active';`, options);
  // Someone in another household cannot; the member themselves can.
  assert.ok(deniedForProfile(ARJUN, `select public.disconnect_whatsapp('${priyaLink}');`, options));
  assert.equal(asProfile(PRIYA, `select public.disconnect_whatsapp('${priyaLink}');`, options), "t");
  assert.equal(psql(`select status || ' ' || (disconnected_at is not null)::text from public.whatsapp_identities where id = '${priyaLink}';`, options), "disconnected true");
  // An admin can end another adult's link too — Kunal (admin) ends his own, as a stand-in; Priya cannot end Kunal's.
  assert.ok(deniedForProfile(PRIYA, `select public.disconnect_whatsapp('${kunalLink}');`, options));
  assert.equal(asProfile(KUNAL, `select public.disconnect_whatsapp('${kunalLink}');`, options), "t");
  // Everything already received stays.
  assert.equal(psql(`select count(*) from public.whatsapp_messages;`, options), "1");
  assert.equal(psql(`select count(*) from public.home_send_items where source like 'whatsapp%';`, options), "2");
  // And the number is free to be linked again, by a fresh code.
  code(household, priya, HASH(10));
  assert.equal(complete(HASH(10), "919800000002"), `linked ${priya}`);
});

test("a member linking a new number ends their old link", () => {
  code(household, priya, HASH("b"));
  assert.equal(complete(HASH("b"), "919800000012"), `linked ${priya}`);
  assert.equal(psql(`select string_agg(wa_user_id || ':' || status, ',' order by wa_user_id) from public.whatsapp_identities where member_id = '${priya}';`, options), "919800000002:disconnected,919800000002:disconnected,919800000012:active");
});
