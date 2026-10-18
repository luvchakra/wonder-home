#!/usr/bin/env node
/**
 * HomeBrain 4.0 (stories 14-026, 14-031):
 *
 * - `homebrain_misses` — one content-free row per deeper look — is the
 *   server's alone: no session reads or writes it, a household member
 *   included.
 * - The safety net: a write to a domain table, however it got there, marks
 *   the household's stored context stale, and only that household's.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_homebrain_4_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";

let household = "";
let other = "";

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${OTHER}', 'olu@example.test');`, options);
  [household] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  [other] = asProfile(OTHER, `select household_id || ' ' || member_id from wh.create_household('Other Home', 'Olu');`, options).split(" ");
  // Two stored contexts, both fresh: built after any write.
  psql(
    `insert into public.household_context (household_id, version, document, sections, unavailable, size_bytes, stale_since, built_at)
     values ('${household}', 1, '[]', '{}', '[]', 2, null, now()), ('${other}', 1, '[]', '{}', '[]', 2, null, now());`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("homebrain_misses is the server's: a member can neither read nor write it", () => {
  psql(`insert into public.homebrain_misses (household_id, domains, trigger, found, latency_ms) values ('${household}', array['bills'], 'not_on_record', true, 120);`, options);
  assert.equal(psql(`select count(*) from public.homebrain_misses;`, options), "1");
  assert.ok(deniedForProfile(HEAD, `select count(*) from public.homebrain_misses;`, options) || asProfile(HEAD, `select count(*) from public.homebrain_misses;`, options) === "0");
  assert.ok(deniedForProfile(HEAD, `insert into public.homebrain_misses (household_id, domains, trigger, found, latency_ms) values ('${household}', array['bills'], 'unknown', false, 1);`, options));
});

test("a miss holds closed words only", () => {
  assert.throws(() => psql(`insert into public.homebrain_misses (household_id, domains, trigger, found, latency_ms) values ('${household}', array['bills'], 'Who is in my family?', false, 1);`, options), /check/);
  assert.throws(() => psql(`insert into public.homebrain_misses (household_id, domains, trigger, found, latency_ms) values ('${household}', array[]::text[], 'unknown', false, 1);`, options), /check/);
});

test("a write to a domain table marks only that household's stored context stale", () => {
  psql(`update public.household_context set stale_since = null, built_at = now() - interval '1 minute';`, options);
  // Straight into the table, the way a write that bypasses a service would.
  psql(`insert into public.pets (household_id, name, species) values ('${household}', 'Rowdy', 'cat');`, options);
  assert.equal(psql(`select (stale_since is not null and stale_since >= built_at)::text from public.household_context where household_id = '${household}';`, options), "true");
  assert.equal(psql(`select (stale_since is null)::text from public.household_context where household_id = '${other}';`, options), "true");
});

test("a stale context is left as it is: one update, not one per row", () => {
  const before = psql(`select stale_since from public.household_context where household_id = '${household}';`, options);
  psql(`insert into public.pets (household_id, name, species) values ('${household}', 'Bruno', 'dog');`, options);
  assert.equal(psql(`select stale_since from public.household_context where household_id = '${household}';`, options), before);
});
