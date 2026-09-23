#!/usr/bin/env node
/**
 * Wave 5 part 3 (story 14-013, §14–§17), at the database. This checks:
 *
 * - `public.rate_limit_hit` counts atomically within a window, keeps
 *   subjects and buckets apart, and only the trusted server (service_role)
 *   may call it. No session can read or reset a counter.
 * - `homesend_email_events` holds closed words only, and no session can read
 *   or write it.
 * - `public.claim_jobs` / `public.complete_job` reach the job queue for the
 *   server alone.
 * - A member can complete and release their own household's idempotency
 *   reservation, and never another household's.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_hardening_test";
const options = { database: DB };

const HEAD = "41111111-1111-4111-8111-111111111111";
const OUTSIDER = "42222222-2222-4222-8222-222222222222";

let household = "";
let otherHousehold = "";

function asRole(role, sql) {
  return execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-d", DB, "-tA", "-f", "-"], {
    encoding: "utf8",
    input: `\\o /dev/null\nset role ${role};\n\\o\n${sql}`,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function denied(run) {
  try {
    run();
    return false;
  } catch {
    return true;
  }
}

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${OUTSIDER}', 'arjun@example.test');`, options);
  household = asProfile(HEAD, `select household_id from wh.create_household('Mehta Home', 'Kunal');`, options);
  otherHousehold = asProfile(OUTSIDER, `select household_id from wh.create_household('Arjun Home', 'Arjun');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a rate limit lets exactly the limit through in one window, per subject and per bucket", () => {
  const hit = (bucket, subject) => asRole("service_role", `select public.rate_limit_hit('${bucket}', '${subject}', 3600, 3);`);
  assert.deepEqual([hit("hometalk.turn", "m-1"), hit("hometalk.turn", "m-1"), hit("hometalk.turn", "m-1"), hit("hometalk.turn", "m-1")], ["t", "t", "t", "f"]);
  assert.equal(hit("hometalk.turn", "m-2"), "t", "one member's burst spent another member's limit");
  assert.equal(hit("homesend.intake", "m-1"), "t", "one bucket's burst spent another bucket's limit");
});

test("a rate limit refuses nonsense windows rather than dividing by zero", () => {
  assert.ok(denied(() => asRole("service_role", `select public.rate_limit_hit('hometalk.turn', 'm-9', 0, 3);`)));
});

test("no session can call the limiter, read a counter or reset one", () => {
  assert.ok(deniedForProfile(HEAD, `select public.rate_limit_hit('hometalk.turn', 'm-1', 60, 1000);`, options), "a member could spend or probe a limit");
  assert.ok(denied(() => asRole("anon", `select public.rate_limit_hit('hometalk.turn', 'm-1', 60, 1000);`)));
  assert.equal(asProfile(HEAD, `select count(*) from public.rate_limit_counters;`, options), "0", "a member could read the counters");
  asProfile(HEAD, `delete from public.rate_limit_counters;`, options);
  assert.ok(deniedForProfile(HEAD, `insert into public.rate_limit_counters (bucket, subject, window_start, hits) values ('hometalk.turn', 'm-1', now(), 0);`, options), "a member could plant a counter");
  assert.equal(psql(`select count(*) > 0 from public.rate_limit_counters where subject = 'm-1';`, options), "t", "a member reset a limit");
});

test("email events take closed words only", () => {
  psql(`insert into public.homesend_email_events (household_id, kind, latency_ms) values ('${household}', 'processed', 812), (null, 'signature_failed', null);`, options);
  assert.throws(() => psql(`insert into public.homesend_email_events (kind) values ('Subject: your bill is ready');`, options));
  assert.throws(() => psql(`insert into public.homesend_email_events (kind, latency_ms) values ('processed', -1);`, options));
});

test("no session can read or write email telemetry", () => {
  assert.equal(asProfile(HEAD, `select count(*) from public.homesend_email_events;`, options), "0", "a member could read platform email telemetry");
  assert.ok(deniedForProfile(HEAD, `insert into public.homesend_email_events (household_id, kind) values ('${household}', 'delivered');`, options));
  const anonymous = (() => {
    try {
      return asRole("anon", `select count(*) from public.homesend_email_events;`);
    } catch {
      return "0";
    }
  })();
  assert.equal(anonymous, "0");
});

test("the job queue is reachable by the server through its wrappers, and by nobody else", () => {
  const job = psql(`insert into public.jobs (household_id, kind, payload, dedupe_key) values ('${household}', 'homesend.classify', '{"itemId":"x"}', 'x') returning id;`, options);
  const claimed = asRole("service_role", `select id from public.claim_jobs('test-worker', 5, 60);`);
  assert.equal(claimed, job);
  asRole("service_role", `select status from public.complete_job('${job}', null);`);
  assert.equal(psql(`select status from public.jobs where id = '${job}';`, options), "succeeded");
  assert.ok(deniedForProfile(HEAD, `select * from public.claim_jobs('member', 5, 60);`, options), "a member could claim queued work");
  assert.ok(deniedForProfile(HEAD, `select * from public.complete_job('${job}', null);`, options), "a member could complete queued work");
});

test("a queued retry is queued once per item while it waits", () => {
  psql(`insert into public.jobs (household_id, kind, dedupe_key) values ('${household}', 'homesend.classify', 'item-1');`, options);
  assert.throws(() => psql(`insert into public.jobs (household_id, kind, dedupe_key) values ('${household}', 'homesend.classify', 'item-1');`, options), /duplicate key/);
});

test("a member completes and releases their own household's idempotency reservation, never another's", () => {
  const reserve = (h, key) =>
    `insert into public.idempotency_keys (household_id, key, endpoint, request_hash, response_status, expires_at) values ('${h}', '${key}', 'POST /x', 'hash', 102, now() + interval '2 minutes');`;
  asProfile(HEAD, reserve(household, "turn-own-123456"), options);
  asProfile(HEAD, `update public.idempotency_keys set response_status = 200, response_body = '{"ok":true}' where key = 'turn-own-123456';`, options);
  assert.equal(psql(`select response_status from public.idempotency_keys where key = 'turn-own-123456';`, options), "200");

  asProfile(HEAD, reserve(household, "turn-rel-123456"), options);
  asProfile(HEAD, `delete from public.idempotency_keys where key = 'turn-rel-123456';`, options);
  assert.equal(psql(`select count(*) from public.idempotency_keys where key = 'turn-rel-123456';`, options), "0");

  asProfile(OUTSIDER, reserve(otherHousehold, "turn-oth-123456"), options);
  asProfile(HEAD, `update public.idempotency_keys set response_status = 500 where key = 'turn-oth-123456';`, options);
  asProfile(HEAD, `delete from public.idempotency_keys where key = 'turn-oth-123456';`, options);
  assert.equal(psql(`select response_status from public.idempotency_keys where key = 'turn-oth-123456';`, options), "102", "one household changed another's idempotency record");
});
