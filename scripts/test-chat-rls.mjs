#!/usr/bin/env node
/**
 * Household chat (story 12-015).
 *
 * Everyone in a household is in its household thread; a direct thread is
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

let household = "";
let headMember = "";
let adultMember = "";
let kidMember = "";
let outsiderMember = "";
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
    `insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test'), ('${OUTSIDER}', 'olu@example.test'), ('${KID}', 'anaya@example.test');`,
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
