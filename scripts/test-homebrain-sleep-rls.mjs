#!/usr/bin/env node
/**
 * HomeBrain Sleep (the owner, 2026-10-19): what a night's sleep keeps.
 *
 * - `homebrain_consolidations`, `homebrain_runs` and `homebrain_links`: an
 *   Admin of the household reads them; nobody else does, and no session
 *   writes them (the nightly run and its undo use the service role).
 * - `homebrain_recall` and `homebrain_embeddings`: no session reads or
 *   writes them at all.
 * - `public.homebrain_recalled` counts an answer's memories, for this
 *   household's memories only, and is the service role's alone.
 * - A new link marks the household's stored context behind.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_homebrain_sleep_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let other = "";
let memory = "";
let otherMemory = "";

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'upasana@example.test'), ('${OUTSIDER}', 'olu@example.test');`, options);
  [household] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Upasana');`, options);
  const adultMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Upasana') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  [other] = asProfile(OUTSIDER, `select household_id || ' ' || member_id from wh.create_household('Other Home', 'Olu');`, options).split(" ");
  memory = psql(`insert into public.memories (household_id, scope, category, key, value, source_type) values ('${household}', 'household', 'preference', 'pref.asmi.pasta', '{"statement":"Asmi likes pasta"}', 'conversation') returning id;`, options);
  otherMemory = psql(`insert into public.memories (household_id, scope, category, key, value, source_type) values ('${other}', 'household', 'preference', 'pref.olu.rice', '{"statement":"Olu likes rice"}', 'conversation') returning id;`, options);
  const run = psql(`insert into public.homebrain_runs (household_id, local_date, outcome) values ('${household}', '2026-10-19', 'done') returning id;`, options);
  psql(`insert into public.homebrain_consolidations (household_id, run_id, kind, memory_ids, statement) values ('${household}', '${run}', 'merged', array['${memory}']::uuid[], 'Asmi likes pasta');`, options);
  psql(`insert into public.household_context (household_id, built_at) values ('${household}', now() - interval '1 minute');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a memory gets its strength columns with safe defaults: everyday, active", () => {
  assert.equal(psql(`select salience || ' ' || tier from public.memories where id = '${memory}';`, options), "1 active");
  assert.throws(() => psql(`update public.memories set tier = 'asleep' where id = '${memory}';`, options), /memories_tier_check/);
});

test("an Admin reads what the night changed and the night's line; another adult and another household do not", () => {
  assert.equal(asProfile(HEAD, `select count(*) from public.homebrain_consolidations;`, options), "1");
  assert.equal(asProfile(HEAD, `select count(*) from public.homebrain_runs;`, options), "1");
  assert.equal(asProfile(ADULT, `select count(*) from public.homebrain_consolidations;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.homebrain_consolidations;`, options), "0");
});

test("no session writes what the night keeps, an Admin included", () => {
  assert.ok(deniedForProfile(HEAD, `insert into public.homebrain_consolidations (household_id, kind, statement) values ('${household}', 'merged', 'x');`, options));
  assert.ok(deniedForProfile(HEAD, `insert into public.homebrain_links (household_id, from_item, to_item, kind, reason) values ('${household}', 'memory:a', 'meal:b', 'related', 'x');`, options));
  asProfile(HEAD, `update public.homebrain_consolidations set undone_at = now();`, options);
  assert.equal(psql(`select count(*) from public.homebrain_consolidations where undone_at is not null;`, options), "0");
});

test("recall counts and meaning are unreachable from any session", () => {
  psql(`select public.homebrain_recalled('${household}', array['${memory}']::uuid[]);`, options);
  assert.equal(asProfile(HEAD, `select count(*) from public.homebrain_recall;`, options), "0");
  assert.ok(deniedForProfile(HEAD, `select public.homebrain_recalled('${household}', array['${memory}']::uuid[]);`, options));
});

test("an answer's recall counts only this household's own memories, and again each time", () => {
  psql(`select public.homebrain_recalled('${household}', array['${memory}', '${otherMemory}']::uuid[]);`, options);
  assert.equal(psql(`select recall_count from public.homebrain_recall where memory_id = '${memory}';`, options), "2");
  assert.equal(psql(`select count(*) from public.homebrain_recall where memory_id = '${otherMemory}';`, options), "0");
});

test("a new link marks the household's stored context behind", () => {
  psql(`insert into public.homebrain_links (household_id, from_item, to_item, kind, reason) values ('${household}', 'memory:${memory}', 'meal:x', 'likes_what_is_planned', 'Asmi likes pasta; pasta is planned');`, options);
  assert.equal(psql(`select (stale_since >= built_at) from public.household_context where household_id = '${household}';`, options), "t");
  assert.equal(asProfile(HEAD, `select count(*) from public.homebrain_links;`, options), "1");
  assert.equal(asProfile(ADULT, `select count(*) from public.homebrain_links;`, options), "0");
});

test("meaning is stored where the database has pgvector, and only the service role compares it", { skip: psql(`select count(*) from pg_available_extensions where name = 'vector';`, { database: "postgres" }) === "0" }, () => {
  const vector = `'[${Array.from({ length: 768 }, (_, index) => (index === 0 ? 1 : 0)).join(",")}]'`;
  psql(`insert into public.homebrain_embeddings (household_id, item_id, model, content_hash, privacy_class, embedding) values ('${household}', 'memory:${memory}', 'test-model', 'h', 'general', ${vector});`, options);
  assert.equal(psql(`select item_id || ' ' || round(similarity::numeric, 2) from public.match_homebrain_embeddings('${household}', 'test-model', ${vector}, 5);`, options), `memory:${memory} 1.00`);
  assert.equal(psql(`select count(*) from public.match_homebrain_embeddings('${other}', 'test-model', ${vector}, 5);`, options), "0");
  assert.equal(asProfile(HEAD, `select count(*) from public.homebrain_embeddings;`, options), "0");
  assert.ok(deniedForProfile(HEAD, `select * from public.match_homebrain_embeddings('${household}', 'test-model', ${vector}, 5);`, options));
});
