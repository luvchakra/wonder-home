#!/usr/bin/env node
/**
 * Household chat (story 12-015).
 *
 * Everyone in a household but its househelpers is in its household thread
 * (Family chat); a direct thread is
 * between two members and only they read it; adding a third person makes it
 * a group they can then read, history included. Nobody outside a household
 * reads or writes any of it, a message is written only as yourself, only its
 * writer changes or takes it back, and a link is only ever a path on this site.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_chat_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const KID = "44444444-4444-4444-8444-444444444444";
const HELPER = "55555555-5555-4555-8555-555555555555";

let household = "";
let headMember = "";
let adultMember = "";
let kidMember = "";
let outsiderMember = "";
let helperMember = "";
let householdThread = "";
let direct = "";

const say = (profile, thread, member, body, extra = "") =>
  asProfile(
    profile,
    `insert into public.chat_messages (thread_id, household_id, author_member_id, body${extra ? ", link_kind, link_path, link_label" : ""}) values ('${thread}', '${household}', '${member}', '${body}'${extra}) returning id;`,
    options,
  );

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test'), ('${OUTSIDER}', 'olu@example.test'), ('${KID}', 'anaya@example.test'), ('${HELPER}', 'rekha@example.test');`,
    options,
  );
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya'), ('${KID}', 'Anaya');`, options);
  adultMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  kidMember = asProfile(HEAD, `select wh.create_child_member('${household}', 'Anaya', '2016-09-18', array['${headMember}']::uuid[]);`, options);
  psql(`update public.household_members set profile_id = '${KID}' where id = '${kidMember}';`, options);
  psql(`insert into public.profiles (id, display_name) values ('${HELPER}', 'Rekha');`, options);
  helperMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${HELPER}', 'helper', 'Rekha') returning id;`,
    options,
  );
  const other = asProfile(OUTSIDER, `select household_id || ' ' || member_id from wh.create_household('Other Home', 'Olu');`, options).split(" ");
  outsiderMember = other[1];
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("everyone in the household is in its one household thread, and nobody else is", () => {
  householdThread = asProfile(HEAD, `select public.chat_household_thread('${household}');`, options);
  assert.equal(asProfile(KID, `select public.chat_household_thread('${household}');`, options), householdThread);
  say(HEAD, householdThread, headMember, "Milk is on the list");
  say(KID, householdThread, kidMember, "Got it");
  assert.equal(asProfile(ADULT, `select count(*) from public.chat_messages where thread_id = '${householdThread}';`, options), "2");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.chat_messages;`, options), "0");
  assert.throws(() => asProfile(OUTSIDER, `select public.chat_household_thread('${household}');`, options), /not a member/);
  assert.throws(() => say(OUTSIDER, householdThread, outsiderMember, "hello"), /row-level security|violates/);
});

test("a househelper is never in the family chat, but keeps a direct chat", () => {
  assert.throws(() => asProfile(HELPER, `select public.chat_household_thread('${household}');`, options), /for the family/);
  assert.equal(asProfile(HELPER, `select count(*) from public.chat_messages where thread_id = '${householdThread}';`, options), "0");
  assert.equal(asProfile(HELPER, `select count(*) from public.chat_threads where id = '${householdThread}';`, options), "0");
  assert.throws(() => say(HELPER, householdThread, helperMember, "hello"), /row-level security|violates/);
  const helperDirect = asProfile(HEAD, `select public.chat_open_direct('${helperMember}');`, options);
  say(HELPER, helperDirect, helperMember, "Coming at 9 tomorrow");
  assert.equal(asProfile(HEAD, `select count(*) from public.chat_messages where thread_id = '${helperDirect}';`, options), "1");
});

test("a message is written only as yourself", () => {
  assert.throws(() => say(ADULT, householdThread, headMember, "pretending"), /row-level security/);
});

test("a direct thread is found again, and only its two people read it", () => {
  direct = asProfile(HEAD, `select public.chat_open_direct('${adultMember}');`, options);
  assert.equal(asProfile(ADULT, `select public.chat_open_direct('${headMember}');`, options), direct);
  say(HEAD, direct, headMember, "Can you pay the electricity bill?", `, 'bill', '/bills', 'Electricity'`);
  assert.equal(asProfile(ADULT, `select count(*) from public.chat_messages where thread_id = '${direct}';`, options), "1");
  assert.equal(asProfile(KID, `select count(*) from public.chat_messages where thread_id = '${direct}';`, options), "0");
  assert.throws(() => say(KID, direct, kidMember, "let me in"), /row-level security/);
  assert.throws(() => asProfile(HEAD, `select public.chat_open_direct('${outsiderMember}');`, options), /same household/);
  assert.throws(() => asProfile(HEAD, `select public.chat_open_direct('${headMember}');`, options), /same household/);
});

test("people are added one at a time, and a direct thread with a third becomes a group", () => {
  assert.throws(() => asProfile(KID, `select public.chat_add_participants('${direct}', array['${kidMember}']::uuid[]);`, options), /only someone in the chat/);
  assert.throws(() => asProfile(HEAD, `select public.chat_add_participants('${direct}', array['${outsiderMember}']::uuid[]);`, options), /in this household/);
  assert.equal(asProfile(ADULT, `select public.chat_add_participants('${direct}', array['${kidMember}']::uuid[]);`, options), "1");
  assert.equal(psql(`select kind || ':' || coalesce(direct_key, '-') from public.chat_threads where id = '${direct}';`, options), "group:-");
  assert.equal(asProfile(KID, `select count(*) from public.chat_messages where thread_id = '${direct}';`, options), "1");
  assert.equal(asProfile(ADULT, `select public.chat_add_participants('${direct}', array['${kidMember}']::uuid[]);`, options), "0");
  // The two adults can still open a direct thread of their own.
  assert.notEqual(asProfile(HEAD, `select public.chat_open_direct('${adultMember}');`, options), direct);
});

test("only the writer changes or takes back a message, and only its words and link", () => {
  const id = say(ADULT, householdThread, adultMember, "Dinner at 8");
  asProfile(HEAD, `update public.chat_messages set body = 'hijacked' where id = '${id}';`, options);
  assert.equal(psql(`select body from public.chat_messages where id = '${id}';`, options), "Dinner at 8");
  asProfile(ADULT, `update public.chat_messages set body = 'Dinner at 8:30', edited_at = now() where id = '${id}';`, options);
  assert.equal(psql(`select body from public.chat_messages where id = '${id}';`, options), "Dinner at 8:30");
  assert.throws(() => asProfile(ADULT, `update public.chat_messages set author_member_id = '${headMember}' where id = '${id}';`, options), /permission denied|only a message/);
  asProfile(ADULT, `update public.chat_messages set removed_at = now() where id = '${id}';`, options);
  assert.throws(() => asProfile(ADULT, `update public.chat_messages set removed_at = null where id = '${id}';`, options), /stays taken back/);
  // Nobody deletes a message, not even its writer: a taken-back one keeps its row.
  assert.throws(() => asProfile(ADULT, `delete from public.chat_messages where id = '${id}';`, options), /permission denied/);
  assert.equal(psql(`select count(*) from public.chat_messages where id = '${id}';`, options), "1");
});

test("a link is only ever a path on this site", () => {
  for (const path of ["//evil.example", "https://evil.example", "/\\\\evil.example"]) {
    assert.throws(() => say(HEAD, householdThread, headMember, "look", `, 'page', '${path}', 'Look'`), /check constraint/, path);
  }
  assert.throws(() => say(HEAD, householdThread, headMember, "look", `, 'page', '/bills', null`), /check constraint/);
});

test("the inbox counts what others wrote since you last read, and reading clears it", () => {
  const unread = () =>
    asProfile(ADULT, `select unread from public.chat_inbox('${household}') where thread_id = '${householdThread}';`, options);
  assert.equal(unread(), "2");
  asProfile(ADULT, `select public.chat_mark_read('${householdThread}');`, options);
  assert.equal(unread(), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.chat_inbox('${household}');`, options), "0");
  assert.throws(() => asProfile(OUTSIDER, `select public.chat_mark_read('${householdThread}');`, options), /not in this chat/);
});

test("someone can leave a group, and then reads it no more; the household thread cannot be left", () => {
  asProfile(KID, `select public.chat_leave('${direct}');`, options);
  assert.equal(asProfile(KID, `select count(*) from public.chat_messages where thread_id = '${direct}';`, options), "0");
  assert.throws(() => asProfile(KID, `select public.chat_leave('${householdThread}');`, options), /only a group chat/);
});

test("someone in a chat reacts with one emoji, changes it, and takes it away", () => {
  const id = say(ADULT, householdThread, adultMember, "Pizza tonight?");
  assert.equal(asProfile(HEAD, `select public.chat_react('${id}', '👍');`, options), "👍");
  assert.equal(asProfile(KID, `select public.chat_react('${id}', '😂');`, options), "😂");
  assert.equal(asProfile(ADULT, `select count(*) from public.chat_message_reactions where message_id = '${id}';`, options), "2");
  // The row takes its thread and household from the message, never from the caller.
  assert.equal(psql(`select thread_id || ':' || household_id from public.chat_message_reactions where message_id = '${id}' and member_id = '${headMember}';`, options), `${householdThread}:${household}`);
  // One per person: reacting again changes it.
  asProfile(HEAD, `select public.chat_react('${id}', '❤️');`, options);
  assert.equal(psql(`select string_agg(emoji, ',') from public.chat_message_reactions where message_id = '${id}' and member_id = '${headMember}';`, options), "❤️");
  asProfile(HEAD, `select public.chat_react('${id}', null);`, options);
  assert.equal(psql(`select count(*) from public.chat_message_reactions where message_id = '${id}' and member_id = '${headMember}';`, options), "0");
  // Only the fixed set.
  assert.throws(() => asProfile(HEAD, `select public.chat_react('${id}', 'lol');`, options), /check constraint/);
});

test("nobody outside a chat reads or writes its reactions, and a helper never reacts in Family chat", () => {
  const id = say(HEAD, householdThread, headMember, "Movie night Friday");
  asProfile(ADULT, `select public.chat_react('${id}', '🙏');`, options);
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.chat_message_reactions;`, options), "0");
  assert.throws(() => asProfile(OUTSIDER, `select public.chat_react('${id}', '👍');`, options), /cannot be reacted to/);
  assert.throws(
    () => asProfile(OUTSIDER, `insert into public.chat_message_reactions (message_id, thread_id, household_id, member_id, emoji) values ('${id}', '${householdThread}', '${household}', '${outsiderMember}', '👍');`, options),
    /row-level security|violates/,
  );
  assert.equal(asProfile(HELPER, `select count(*) from public.chat_message_reactions where thread_id = '${householdThread}';`, options), "0");
  assert.throws(() => asProfile(HELPER, `select public.chat_react('${id}', '👍');`, options), /cannot be reacted to/);
  assert.throws(
    () => asProfile(HELPER, `insert into public.chat_message_reactions (message_id, thread_id, household_id, member_id, emoji) values ('${id}', '${householdThread}', '${household}', '${helperMember}', '👍');`, options),
    /row-level security|violates/,
  );
  // Someone who left a group no longer reacts there.
  const groupMessage = say(HEAD, direct, headMember, "Who is in?");
  assert.throws(() => asProfile(KID, `select public.chat_react('${groupMessage}', '👍');`, options), /cannot be reacted to/);
});

test("nobody changes or removes someone else's reaction, and a taken-back message takes none", () => {
  const id = say(HEAD, householdThread, headMember, "Bins go out tonight");
  asProfile(ADULT, `select public.chat_react('${id}', '👍');`, options);
  asProfile(HEAD, `update public.chat_message_reactions set emoji = '😢' where message_id = '${id}' and member_id = '${adultMember}';`, options);
  asProfile(HEAD, `delete from public.chat_message_reactions where message_id = '${id}' and member_id = '${adultMember}';`, options);
  assert.equal(psql(`select emoji from public.chat_message_reactions where message_id = '${id}' and member_id = '${adultMember}';`, options), "👍");
  assert.throws(
    () => asProfile(HEAD, `insert into public.chat_message_reactions (message_id, thread_id, household_id, member_id, emoji) values ('${id}', '${householdThread}', '${household}', '${adultMember}', '😮');`, options),
    /row-level security|duplicate|violates/,
  );
  assert.throws(() => asProfile(ADULT, `update public.chat_message_reactions set member_id = '${headMember}' where message_id = '${id}';`, options), /permission denied/);
  asProfile(HEAD, `update public.chat_messages set removed_at = now() where id = '${id}';`, options);
  assert.throws(() => asProfile(KID, `select public.chat_react('${id}', '👍');`, options), /cannot be reacted to/);
});
