#!/usr/bin/env node
/**
 * Job queue tests (ADR-007).
 *
 * A queue is bought or built; this one is built, so its guarantees have to be
 * demonstrated rather than assumed: no double-claiming under concurrency, leases
 * that release when a worker dies, backoff that actually backs off, a dead
 * letter rather than a hot loop, and no household able to see or schedule work.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_jobs_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const OUTSIDER = "22222222-2222-4222-8222-222222222222";

let household = "";
let otherHousehold = "";

function enqueue(kind, { runAfter = "now()", dedupe = null, household: h = household, maxAttempts = 5 } = {}) {
  return psql(
    `insert into public.jobs (household_id, kind, run_after, dedupe_key, max_attempts)
     values ('${h}', '${kind}', ${runAfter}, ${dedupe ? `'${dedupe}'` : "null"}, ${maxAttempts})
     returning id;`,
    options,
  );
}

const jobField = (id, field) =>
  psql(`select ${field} from public.jobs where id = '${id}';`, options);

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'), ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );
  [household] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");
  [otherHousehold] = asProfile(
    OUTSIDER,
    `select household_id || ' ' || member_id from wh.create_household('Outsider Home', 'Outsider');`,
    options,
  ).split(" ");
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a due job is claimed and a future one is not", () => {
  const due = enqueue("outcome.evaluate");
  enqueue("outcome.evaluate", { runAfter: "now() + interval '1 hour'" });

  const claimed = psql(`select id from wh.claim_jobs('worker-1', 10, 60);`, options)
    .split("\n")
    .filter(Boolean);

  assert.deepEqual(claimed, [due], "claimed the wrong set of jobs");
  assert.equal(jobField(due, "status"), "claimed");
  assert.equal(jobField(due, "attempts"), "1");
});

test("sequential claims do not hand out the same job twice", () => {
  psql(`delete from public.jobs;`, options);
  for (let i = 0; i < 20; i += 1) enqueue("outcome.evaluate");

  const first = psql(`select id from wh.claim_jobs('worker-1', 10, 60);`, options)
    .split("\n")
    .filter(Boolean);
  const second = psql(`select id from wh.claim_jobs('worker-2', 10, 60);`, options)
    .split("\n")
    .filter(Boolean);

  assert.equal(first.length, 10);
  assert.equal(second.length, 10);
  assert.equal(new Set([...first, ...second]).size, 20, "a job was handed to two workers");
});

test("workers claiming simultaneously take disjoint sets", () => {
  // This is the case SKIP LOCKED exists for: real contention, in separate
  // sessions, started at the same moment. A sequential test would pass even
  // without it.
  psql(`delete from public.jobs;`, options);
  for (let i = 0; i < 60; i += 1) enqueue("outcome.evaluate");

  const workers = 6;
  const claimed = execFileSync(
    "bash",
    [
      "-c",
      Array.from(
        { length: workers },
        (_, index) =>
          `psql -q -d ${DB} -tA -c "select id from wh.claim_jobs('worker-${index}', 10, 60);" &`,
      ).join("\n") + "\nwait",
    ],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);

  assert.equal(claimed.length, 60, `expected every job claimed once, saw ${claimed.length}`);
  assert.equal(
    new Set(claimed).size,
    claimed.length,
    "the same job was handed to more than one worker under contention",
  );

  // And every claim was recorded exactly once, not double-counted.
  assert.equal(
    psql(`select count(*) from public.jobs where status = 'claimed' and attempts = 1;`, options),
    "60",
  );
});

test("a job whose lease expired becomes claimable again", () => {
  psql(`delete from public.jobs;`, options);
  const id = enqueue("outcome.evaluate");
  psql(`select id from wh.claim_jobs('worker-1', 10, 60);`, options);

  // Nothing else may take it while the lease holds.
  assert.equal(psql(`select count(*) from wh.claim_jobs('worker-2', 10, 60);`, options), "0");

  // The worker dies: the lease lapses.
  psql(`update public.jobs set claimed_until = now() - interval '1 second' where id = '${id}';`, options);

  const reclaimed = psql(`select id from wh.claim_jobs('worker-2', 10, 60);`, options);
  assert.equal(reclaimed, id, "an abandoned job was never picked up again");
  assert.equal(jobField(id, "attempts"), "2", "a reclaim should count as another attempt");
});

test("a successful job is finished, not retried", () => {
  psql(`delete from public.jobs;`, options);
  const id = enqueue("outcome.evaluate");
  psql(`select id from wh.claim_jobs('worker-1', 10, 60);`, options);
  psql(`select id from wh.complete_job('${id}', null);`, options);

  assert.equal(jobField(id, "status"), "succeeded");
  assert.equal(jobField(id, "claimed_until"), "");
  assert.equal(psql(`select count(*) from wh.claim_jobs('worker-1', 10, 60);`, options), "0");
});

test("a failure is retried later rather than immediately", () => {
  psql(`delete from public.jobs;`, options);
  const id = enqueue("outcome.evaluate");
  psql(`select id from wh.claim_jobs('worker-1', 10, 60);`, options);
  psql(`select id from wh.complete_job('${id}', 'provider timed out');`, options);

  assert.equal(jobField(id, "status"), "pending");
  assert.equal(
    psql(`select run_after > now() from public.jobs where id = '${id}';`, options),
    "t",
    "a failed job was immediately claimable, which is a hot loop",
  );
  assert.match(jobField(id, "last_error"), /provider timed out/);
});

test("backoff grows with each attempt", () => {
  psql(`delete from public.jobs;`, options);
  const id = enqueue("outcome.evaluate");

  const delays = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    psql(`update public.jobs set run_after = now() - interval '1 second' where id = '${id}';`, options);
    psql(`select id from wh.claim_jobs('worker-1', 10, 60);`, options);
    psql(`select id from wh.complete_job('${id}', 'still failing');`, options);
    delays.push(
      Number(
        psql(
          `select round(extract(epoch from (run_after - now()))) from public.jobs where id = '${id}';`,
          options,
        ),
      ),
    );
  }

  assert.ok(delays[1] > delays[0], `expected growing backoff, saw ${delays.join(", ")}`);
  assert.ok(delays[2] > delays[1], `expected growing backoff, saw ${delays.join(", ")}`);
});

test("a job that keeps failing is parked rather than retried forever", () => {
  psql(`delete from public.jobs;`, options);
  const id = enqueue("outcome.evaluate", { maxAttempts: 2 });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    psql(`update public.jobs set run_after = now() - interval '1 second' where id = '${id}';`, options);
    psql(`select id from wh.claim_jobs('worker-1', 10, 60);`, options);
    psql(`select id from wh.complete_job('${id}', 'permanently broken');`, options);
  }

  assert.equal(jobField(id, "status"), "dead");
  assert.equal(
    psql(`select count(*) from wh.claim_jobs('worker-1', 10, 60);`, options),
    "0",
    "a dead job was claimed again",
  );
});

test("deduplication prevents a second pending copy of the same work", () => {
  psql(`delete from public.jobs;`, options);
  enqueue("outcome.evaluate", { dedupe: "laundry.ready:2026-09-17" });

  let rejected = false;
  try {
    enqueue("outcome.evaluate", { dedupe: "laundry.ready:2026-09-17" });
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "the same work was queued twice");

  // Once it is finished, the same key may be queued again for the next run.
  psql(`update public.jobs set status = 'succeeded' where dedupe_key is not null;`, options);
  assert.ok(enqueue("outcome.evaluate", { dedupe: "laundry.ready:2026-09-17" }));
});

test("a household administrator sees only their own household's jobs", () => {
  psql(`delete from public.jobs;`, options);
  enqueue("outcome.evaluate");
  enqueue("outcome.evaluate", { household: otherHousehold });

  assert.equal(asProfile(HEAD, `select count(*) from public.jobs;`, options), "1");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.jobs;`, options), "1");
});

test("platform-wide work is invisible to every household", () => {
  psql(
    `insert into public.jobs (household_id, kind) values (null, 'idempotency.purge');`,
    options,
  );

  assert.equal(
    asProfile(HEAD, `select count(*) from public.jobs where household_id is null;`, options),
    "0",
    "a platform job was visible to a household",
  );
});

test("nobody can schedule work from a browser session", () => {
  let rejected = false;
  try {
    asProfile(
      HEAD,
      `insert into public.jobs (household_id, kind) values ('${household}', 'mine.evaluate');`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "a client enqueued a job");
});
