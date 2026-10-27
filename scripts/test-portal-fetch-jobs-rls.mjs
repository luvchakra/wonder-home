#!/usr/bin/env node
/**
 * Portal fetch job queue (story 08-033).
 *
 * An Admin enqueues a fetch for their own connection; a non-admin cannot. A
 * household reads its own jobs, another household none. The worker's claim is
 * service-role only — no browser-reachable role may call it.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_portal_jobs_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let adultMember = "";
let integration = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test'), ('${OUTSIDER}', 'olu@example.test');`,
    options,
  );
  household = asProfile(HEAD, `select household_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).trim();
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

test("an Admin enqueues a fetch; a non-admin cannot", () => {
  const jobId = asProfile(HEAD, `select public.enqueue_portal_fetch_job('${integration}');`, options).trim();
  assert.match(jobId, /[0-9a-f-]{36}/);
  // Deduped to the open job.
  assert.equal(asProfile(HEAD, `select public.enqueue_portal_fetch_job('${integration}');`, options).trim(), jobId);
  assert.throws(() => asProfile(ADULT, `select public.enqueue_portal_fetch_job('${integration}');`, options), /not permitted|permission/i);
});

test("a household reads its own jobs; another household reads none", () => {
  assert.equal(asProfile(ADULT, `select count(*) from public.portal_fetch_jobs where household_id = '${household}';`, options).trim(), "1");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.portal_fetch_jobs where household_id = '${household}';`, options).trim(), "0");
});

test("claiming a job is the worker's alone — authenticated cannot", () => {
  assert.throws(() => asProfile(HEAD, `select * from public.claim_portal_fetch_job();`, options), /permission denied|denied for|not .*permitted/i);
  const claimed = psql(`select integration_id from public.claim_portal_fetch_job();`, options).trim();
  assert.equal(claimed, integration);
  // It is now running, not pending.
  assert.equal(psql(`select status from public.portal_fetch_jobs where integration_id = '${integration}';`, options).trim(), "running");
});

after(() => {
  psql(`drop database if exists ${DB} with (force);`, { database: "postgres" });
});
