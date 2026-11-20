#!/usr/bin/env node
/**
 * Reset home and the full download (story 15-014).
 *
 *   - every household table in the schema is classified exactly once in
 *     packages/core/src/household/reset-tables.json, and its `kept` list is
 *     the database's own (so a new table cannot slip past the reset or the
 *     download unclassified);
 *   - only the service role may call the reset, and only for the household
 *     whose owner it names, with that household's name typed;
 *   - a reset of household A leaves household B byte-for-byte as it was, in
 *     every household table;
 *   - A comes back as a new household: the owner alone, head, nothing else but
 *     the kept tables, one audit entry; running it again changes nothing more;
 *   - the download reads as the caller: an Admin is never handed a row their
 *     own session could not read.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_reset_test";
const options = { database: DB };
const MANIFEST = JSON.parse(readFileSync(new URL("../packages/core/src/household/reset-tables.json", import.meta.url), "utf8"));

const OWNER_A = "a1111111-1111-4111-8111-111111111111";
const ADMIN_A = "a2222222-2222-4222-8222-222222222222";
const CHILD_A = "a3333333-3333-4333-8333-333333333333";
const HELPER_A = "a4444444-4444-4444-8444-444444444444";
const ADULT_A = "a5555555-5555-4555-8555-555555555555";
const OWNER_B = "b1111111-1111-4111-8111-111111111111";
const ADULT_B = "b2222222-2222-4222-8222-222222222222";

const ids = {};

function asService(sql) {
  return psql(`set role service_role;\n${sql}`, options);
}

function member(household, profile, name, type, role) {
  if (profile) psql(`insert into public.profiles (id, display_name) values ('${profile}', '${name}') on conflict do nothing;`, options);
  const id = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', ${profile ? `'${profile}'` : "null"}, '${type}', '${name}') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${id}', '${role}');`, options);
  return id;
}

/** Rows in a spread of modules, so the reset has foreign keys and triggers to get through. */
function fill(household, owner, other, label) {
  psql(
    `insert into public.household_invitations (household_id, invited_by_member_id, email, display_name, token_hash, expires_at)
       values ('${household}', '${owner}', 'cousin-${label}@example.test', 'Cousin ${label}', md5('${label}'), now() + interval '7 days');
     insert into public.obligations (household_id, name) values ('${household}', 'Electricity ${label}');
     insert into public.family_events (household_id, title, starts_at, ends_at)
       values ('${household}', 'Picnic ${label}', now() + interval '1 day', now() + interval '1 day 2 hours');
     insert into public.notifications (household_id, recipient_member_id, type, thread_key, title, body)
       values ('${household}', '${other}', 'action', 'thread-${label}', 'Pay', 'Electricity');
     insert into public.home_send_items (household_id, source, raw_text, created_by_member_id)
       values ('${household}', 'pasted_text', 'Electricity due on the 12th', '${owner}');
     insert into public.health_records (household_id, member_id, label, record_type, file_path)
       values ('${household}', '${other}', 'Blood test ${label}', 'lab_result', '${household}/blood-test.pdf');
     insert into public.memories (household_id, scope, category, key, value, source_type)
       values ('${household}', 'household', 'preference', 'tea_${label.toLowerCase()}', '"masala"', 'conversation');
     insert into public.recipes (household_id, name) values ('${household}', 'Dal ${label}');
     insert into public.household_subscriptions (household_id, plan_key)
       select '${household}', key from public.plans order by key limit 1;
     insert into public.audit_events (household_id, actor_member_id, event_type, target_table, target_id)
       values ('${household}', '${owner}', 'test.seeded', 'households', '${household}');`,
    options,
  );
  const session = psql(
    `insert into public.conversation_sessions (household_id, member_id, channel)
       values ('${household}', '${other}', 'text') returning id;`,
    options,
  );
  psql(
    `insert into public.conversation_messages (household_id, session_id, role, content)
       values ('${household}', '${session}', 'member', 'Remind me about the bill');`,
    options,
  );
}

function householdTables() {
  return psql(`select string_agg(t, ' ' order by t) from wh.household_tables() t;`, options).split(" ");
}

/** A fingerprint of every household table's rows for one household. */
function fingerprint(household) {
  const parts = householdTables().map(
    (table) =>
      `select '${table}' as t, coalesce(md5(string_agg(to_jsonb(x)::text, '|' order by to_jsonb(x)::text)), '-') as h from public.${table} x where household_id = '${household}'`,
  );
  return psql(
    `select string_agg(t || '=' || h, ',' order by t) from (${parts.join(" union all ")}) s;` +
      `\nselect md5(to_jsonb(h)::text) from public.households h where id = '${household}';`,
    options,
  );
}

function count(table, household) {
  return Number(psql(`select count(*) from public.${table} where household_id = '${household}';`, options));
}

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${OWNER_A}', 'owner-a@example.test'), ('${ADMIN_A}', 'admin-a@example.test'), ('${CHILD_A}', 'child-a@example.test'),
       ('${HELPER_A}', 'helper-a@example.test'), ('${ADULT_A}', 'adult-a@example.test'),
       ('${OWNER_B}', 'owner-b@example.test'), ('${ADULT_B}', 'adult-b@example.test');`,
    options,
  );
  [ids.a, ids.ownerA] = asProfile(OWNER_A, `select household_id || ' ' || member_id from wh.create_household('Sharma Home', 'Asha');`, options).split(" ");
  [ids.b, ids.ownerB] = asProfile(OWNER_B, `select household_id || ' ' || member_id from wh.create_household('Banerjee Home', 'Bina');`, options).split(" ");
  ids.adminA = member(ids.a, ADMIN_A, "Arun", "adult", "administrator");
  ids.childA = member(ids.a, CHILD_A, "Anu", "child", "child");
  ids.helperA = member(ids.a, HELPER_A, "Hema", "helper", "helper");
  ids.adultA = member(ids.a, ADULT_A, "Ravi", "adult", "adult");
  ids.adultB = member(ids.b, ADULT_B, "Bose", "adult", "adult");
  fill(ids.a, ids.ownerA, ids.adminA, "A");
  fill(ids.b, ids.ownerB, ids.adultB, "B");
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("every household table is classified exactly once, and kept matches the database", () => {
  const listed = [...Object.values(MANIFEST.areas).flat(), ...Object.keys(MANIFEST.notExported)];
  const duplicates = listed.filter((table, index) => listed.indexOf(table) !== index);
  assert.deepEqual(duplicates, [], "a table is listed twice in reset-tables.json");

  const schema = householdTables();
  const missing = schema.filter((table) => !listed.includes(table));
  assert.deepEqual(missing, [], "new household table(s): classify them in packages/core/src/household/reset-tables.json (an area to download, or notExported with a reason)");
  const stale = listed.filter((table) => !schema.includes(table));
  assert.deepEqual(stale, [], "reset-tables.json names tables the schema no longer has");

  const kept = psql(`select string_agg(t, ' ' order by t) from unnest(wh.household_reset_kept_tables()) t;`, options).split(" ");
  assert.deepEqual([...MANIFEST.kept].sort(), kept, "kept in reset-tables.json differs from wh.household_reset_kept_tables()");
  for (const table of kept) assert.ok(schema.includes(table), `kept table ${table} is not a household table`);
});

test("a signed-in member cannot call the reset at all, not even the owner", () => {
  assert.throws(
    () => asProfile(OWNER_A, `select public.reset_household('${ids.a}', '${OWNER_A}', 'Sharma Home');`, options),
    /permission denied/,
  );
  assert.equal(count("obligations", ids.a), 1);
});

test("another Admin, a child, and another household's owner are refused", () => {
  assert.throws(() => asService(`select public.reset_household('${ids.a}', '${ADMIN_A}', 'Sharma Home');`), /not_owner/);
  assert.throws(() => asService(`select public.reset_household('${ids.a}', '${CHILD_A}', 'Sharma Home');`), /not_owner/);
  assert.throws(() => asService(`select public.reset_household('${ids.a}', '${OWNER_B}', 'Sharma Home');`), /not_owner/);
  assert.throws(() => asService(`select public.reset_household('${ids.b}', '${OWNER_A}', 'Banerjee Home');`), /not_owner/);
  assert.equal(count("household_members", ids.a), 5);
});

test("the home's name must be typed", () => {
  assert.throws(() => asService(`select public.reset_household('${ids.a}', '${OWNER_A}', 'Banerjee Home');`), /name_mismatch/);
  assert.throws(() => asService(`select public.reset_household('${ids.a}', '${OWNER_A}', '');`), /name_mismatch/);
  assert.equal(count("recipes", ids.a), 1);
});

test("the download reads as the caller: the owner never gets another member's private health record", () => {
  const ownerSees = asProfile(OWNER_A, `select jsonb_array_length(public.household_export_rows('${ids.a}', 'health_records', 0, 100));`, options);
  const ownerScreens = asProfile(OWNER_A, `select count(*) from public.health_records where household_id = '${ids.a}';`, options);
  assert.equal(ownerSees, ownerScreens);
  const adminSees = asProfile(ADMIN_A, `select jsonb_array_length(public.household_export_rows('${ids.a}', 'health_records', 0, 100));`, options);
  assert.equal(adminSees, "1", "a person's own record is in what they can download");
  assert.throws(
    () => asProfile(OWNER_A, `select public.household_export_rows('${ids.b}', 'recipes', 0, 100);`, options),
    /not_a_member/,
  );
  assert.throws(
    () => asProfile(OWNER_A, `select public.household_export_rows('${ids.a}', 'plans', 0, 100);`, options),
    /not_a_household_table/,
  );
  const invitation = asProfile(OWNER_A, `select public.household_export_rows('${ids.a}', 'household_invitations', 0, 100)::text;`, options);
  assert.doesNotMatch(invitation, /token_hash/, "secret-named columns stay out of the download");
});

/**
 * Rows a person's download would hold, and rows their own session reads, for every household
 * table: "denied" where their role may not read the table at all (the download skips those too).
 * A test-only function, created in this test's own database.
 */
function parity(profile) {
  psql(
    `create or replace function public.test_export_parity(p_household uuid)
     returns setof text language plpgsql security invoker set search_path = '' as $fn$
     declare t text; exported text; readable text;
     begin
       for t in select x from wh.household_tables() x loop
         begin
           exported := jsonb_array_length(public.household_export_rows(p_household, t, 0, 1000))::text;
         exception when insufficient_privilege then exported := 'denied';
         end;
         begin
           execute format('select count(*)::text from public.%I where household_id = $1', t) into readable using p_household;
         exception when insufficient_privilege then readable := 'denied';
         end;
         return next t || '|' || exported || '|' || readable;
       end loop;
     end $fn$;
     grant execute on function public.test_export_parity(uuid) to authenticated;`,
    options,
  );
  return asProfile(profile, `select public.test_export_parity('${ids.a}');`, options).split("\n").filter(Boolean);
}

test("everyone's download is exactly what their own session reads, table by table: owner, Admin, adult, helper", () => {
  for (const profile of [OWNER_A, ADMIN_A, ADULT_A, HELPER_A]) {
    const lines = parity(profile);
    assert.ok(lines.length > 150, "every household table was compared");
    // Only the tables the download reads: the not-exported ones (secrets, machinery) are never asked for.
    const differ = lines.filter((line) => {
      const [table, exported, readable] = line.split("|");
      return !(table in MANIFEST.notExported) && exported !== readable;
    });
    assert.deepEqual(differ, [], `download and screens disagree for ${profile}`);
  }
  // A helper reads less than the owner: the comparison above is meaningful, not all-or-nothing.
  const total = (profile) => parity(profile).reduce((sum, line) => sum + (Number(line.split("|")[1]) || 0), 0);
  assert.ok(total(HELPER_A) < total(OWNER_A), "a helper's download is smaller than the owner's");
});

test("a member's private health record and private HomeTalk conversation never reach another member's download", () => {
  const rows = (profile, table) =>
    asProfile(profile, `select public.household_export_rows('${ids.a}', '${table}', 0, 1000)::text;`, options);
  // Arun (Admin) holds a private health record and a conversation (see fill()).
  assert.match(rows(ADMIN_A, "health_records"), /Blood test A/);
  assert.match(rows(ADMIN_A, "conversation_messages"), /Remind me about the bill/);
  for (const other of [OWNER_A, ADULT_A, HELPER_A]) {
    assert.doesNotMatch(rows(other, "health_records"), /Blood test A/, `${other} got Arun's health record`);
    assert.doesNotMatch(rows(other, "conversation_messages"), /Remind me about the bill/, `${other} got Arun's conversation`);
  }
});

test("resetting A leaves B byte-for-byte untouched and A as a new household", () => {
  const before = fingerprint(ids.b);
  const auditBefore = count("audit_events", ids.a);

  const result = JSON.parse(asService(`select public.reset_household('${ids.a}', '${OWNER_A}', '  sharma home ');`));
  assert.equal(result.members_removed, 4);
  assert.equal(result.invitations_revoked, 1);

  assert.equal(fingerprint(ids.b), before, "household B changed");

  assert.equal(psql(`select string_agg(id::text, ',') from public.household_members where household_id = '${ids.a}';`, options), ids.ownerA);
  assert.equal(psql(`select string_agg(role, ',') from public.household_roles where household_id = '${ids.a}';`, options), "head");
  assert.equal(psql(`select owner_member_id from public.households where id = '${ids.a}';`, options), ids.ownerA);

  const kept = new Set(MANIFEST.kept);
  const leftovers = householdTables()
    .filter((table) => !kept.has(table) && table !== "household_members" && table !== "household_roles")
    .filter((table) => count(table, ids.a) > 0);
  assert.deepEqual(leftovers, [], "rows left after the reset");

  assert.equal(count("household_subscriptions", ids.a), 1, "the plan is kept");
  assert.equal(count("audit_events", ids.a), auditBefore + 1, "the audit trail is kept, plus one entry for the reset");
  assert.equal(psql(`select event_type from public.audit_events where household_id = '${ids.a}' order by created_at desc limit 1;`, options), "household.reset");

  // Their accounts are not deleted: they simply belong to no home now.
  assert.equal(psql(`select count(*) from auth.users where id in ('${ADMIN_A}', '${CHILD_A}', '${HELPER_A}', '${ADULT_A}');`, options), "4");
  assert.equal(asProfile(ADMIN_A, `select count(*) from public.household_members where household_id = '${ids.a}';`, options), "0");
});

test("running it again is harmless", () => {
  const result = JSON.parse(asService(`select public.reset_household('${ids.a}', '${OWNER_A}', 'Sharma Home');`));
  assert.equal(result.members_removed, 0);
  assert.equal(result.rows_deleted, 0);
  assert.equal(count("household_members", ids.a), 1);
});
