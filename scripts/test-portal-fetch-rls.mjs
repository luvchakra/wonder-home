#!/usr/bin/env node
/**
 * Portal fetch tables (story 08-033).
 *
 * Three access models, one test:
 *  - portal_scrape_urls: an Admin manages which pages are read; members see them;
 *    a non-admin cannot write; another household sees nothing.
 *  - portal_sessions: the session blob is a credential — no browser-reachable role
 *    can read it; the service role can; the status RPC gives state, never the blob.
 *  - portal_fetch_cursors: the worker's alone — authenticated cannot read it.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_portal_fetch_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const HASH = "a".repeat(64);

let household = "";
let headMember = "";
let adultMember = "";
let integration = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test'), ('${OUTSIDER}', 'olu@example.test');`,
    options,
  );
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya');`, options);
  adultMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  integration = psql(
    `insert into public.integrations (household_id, kind, provider, status) values ('${household}', 'school', 'loop-learning', 'connecting') returning id;`,
    options,
  );
  asProfile(OUTSIDER, `select household_id from wh.create_household('Other Home', 'Olu');`, options);
});

test("an Admin adds a page to read; a non-admin cannot", () => {
  const id = asProfile(
    HEAD,
    `insert into public.portal_scrape_urls (household_id, integration_id, url, kind, created_by) values ('${household}', '${integration}', 'https://app.looplearning.com/task/list', 'homework', '${headMember}') returning id;`,
    options,
  );
  assert.match(id, /[0-9a-f-]{36}/);
  assert.throws(() =>
    asProfile(
      ADULT,
      `insert into public.portal_scrape_urls (household_id, integration_id, url, kind, created_by) values ('${household}', '${integration}', 'https://app.looplearning.com/x', 'generic', '${adultMember}') returning id;`,
      options,
    ),
  );
});

test("members see the tracked pages; another household sees nothing", () => {
  assert.equal(asProfile(ADULT, `select count(*) from public.portal_scrape_urls where household_id = '${household}';`, options).trim(), "1");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.portal_scrape_urls where household_id = '${household}';`, options).trim(), "0");
});

test("the session blob is unreadable from a browser, readable by the service role", () => {
  psql(
    `insert into public.portal_sessions (household_id, integration_id, session, state) values ('${household}', '${integration}', 'storage-state-blob', 'connected');`,
    options,
  );
  assert.throws(() => asProfile(HEAD, `select session from public.portal_sessions where household_id = '${household}';`, options), /permission denied|denied for/i);
  assert.equal(psql(`select session from public.portal_sessions where household_id = '${household}';`, options).trim(), "storage-state-blob");
});

test("the status RPC gives the state to an Admin, never the session, and nothing to a non-admin", () => {
  assert.equal(asProfile(HEAD, `select state from public.portal_session_status('${household}');`, options).trim(), "connected");
  assert.throws(() => asProfile(HEAD, `select session from public.portal_session_status('${household}');`, options), /does not exist|column/i);
  assert.equal(asProfile(ADULT, `select count(*) from public.portal_session_status('${household}');`, options).trim(), "0");
});

test("fetch cursors are the worker's alone — authenticated cannot read them", () => {
  psql(
    `insert into public.portal_fetch_cursors (household_id, integration_id, scrape_url, item_hash) values ('${household}', '${integration}', 'https://app.looplearning.com/task/list', '${HASH}');`,
    options,
  );
  assert.throws(() => asProfile(HEAD, `select item_hash from public.portal_fetch_cursors where household_id = '${household}';`, options), /permission denied|denied for/i);
  assert.equal(psql(`select count(*) from public.portal_fetch_cursors where household_id = '${household}';`, options).trim(), "1");
});

test("an Admin can remove a page", () => {
  asProfile(HEAD, `delete from public.portal_scrape_urls where household_id = '${household}';`, options);
  assert.equal(psql(`select count(*) from public.portal_scrape_urls where household_id = '${household}';`, options).trim(), "0");
});

after(() => {
  psql(`drop database if exists ${DB} with (force);`, { database: "postgres" });
});
