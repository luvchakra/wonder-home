#!/usr/bin/env node
/**
 * Plans, entitlements, usage metering and connector tests (20-001..003, 17-001).
 *
 * The one that matters most is atomicity. A quota is only a quota if two
 * concurrent requests cannot both spend the last unit of it, and that is a
 * property of the statement rather than of the application code — so it is
 * proved here, against a real Postgres, with real concurrent sessions.
 *
 * The rest establish that a household cannot grant itself a plan, reset its own
 * meter or forge a provider event, and that no connector row can hold a secret
 * it was never meant to.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_entitlements_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const OUTSIDER = "22222222-2222-4222-8222-222222222222";
const ADULT = "33333333-3333-4333-8333-333333333333";

let household = "";
let otherHousehold = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'), ('${OUTSIDER}', 'outsider@example.test'),
       ('${ADULT}', 'priya@example.test');`,
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

  // A member with no role: present in the household, but not an administrator
  // — the party story 20-004's admin-only write policy exists to stop.
  psql(
    `insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya') on conflict (id) do nothing;
     insert into public.household_members (household_id, profile_id, member_type, display_name, status)
     values ('${household}', '${ADULT}', 'adult', 'Priya', 'active');`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("the plan catalogue ships seeded, because an empty one entitles nobody", () => {
  assert.equal(psql(`select count(*) from public.plans;`, options), "3");
  assert.ok(
    Number(psql(`select count(*) from public.plan_features where plan_key = 'free';`, options)) > 0,
  );
});

test("a household reads the catalogue but cannot edit it", () => {
  assert.equal(asProfile(HEAD, `select count(*) from public.plans;`, options), "3");
  assert.ok(
    deniedForProfile(HEAD, `insert into public.plans (key, name) values ('bespoke', 'Bespoke');`, options),
  );
  // An UPDATE that matches no policy affects zero rows rather than raising, so
  // the assertion is on the value: the catalogue is unchanged either way.
  const before = psql(
    `select limit_per_period from public.plan_features
     where plan_key = 'free' and feature_key = 'ai.agent_runs';`,
    options,
  );
  asProfile(
    HEAD,
    `update public.plan_features set limit_per_period = 999999 where plan_key = 'free';`,
    options,
  );
  assert.equal(
    psql(
      `select limit_per_period from public.plan_features
       where plan_key = 'free' and feature_key = 'ai.agent_runs';`,
      options,
    ),
    before,
    "a household rewrote its own plan's allowance",
  );
});

test("an ordinary member cannot put the household on a plan", () => {
  // Story 20-004 lets an *administrator* change the plan, through the
  // governed route that re-derives the change server-side before writing —
  // the invariant this guards is narrower than it used to be, not gone: a
  // member holding no role still cannot grant the household a plan directly.
  assert.ok(
    deniedForProfile(
      ADULT,
      `insert into public.household_subscriptions (household_id, plan_key) values ('${household}', 'max');`,
      options,
    ),
    "a non-administrator granted the household a plan",
  );
});

test("an administrator can put the household on a plan", () => {
  // The positive case for the same policy: this is what the plan-change route
  // (story 20-004) relies on to write through the household's own session.
  asProfile(
    HEAD,
    `insert into public.household_subscriptions (household_id, plan_key) values ('${household}', 'free')
     on conflict (household_id) do update set plan_key = excluded.plan_key;`,
    options,
  );
  assert.equal(
    psql(`select plan_key from public.household_subscriptions where household_id = '${household}';`, options),
    "free",
  );
});

test("a household sees its own subscription and not another's", () => {
  psql(
    `insert into public.household_subscriptions (household_id, plan_key) values
       ('${household}', 'pro'), ('${otherHousehold}', 'max')
     on conflict (household_id) do update set plan_key = excluded.plan_key;`,
    options,
  );

  assert.equal(asProfile(HEAD, `select plan_key from public.household_subscriptions;`, options), "pro");
  assert.equal(
    asProfile(OUTSIDER, `select plan_key from public.household_subscriptions;`, options),
    "max",
  );
});

test("usage is recorded by the server and cannot be written or reset by a member", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.usage_counters (household_id, feature_key, period_start, used)
       values ('${household}', 'ai.agent_runs', date_trunc('month', now()), 0);`,
      options,
    ),
    "a member wrote their own meter",
  );

  psql(
    `select wh.record_usage('${household}', 'ai.agent_runs', date_trunc('month', now()), 3, 20);`,
    options,
  );

  assert.equal(
    asProfile(HEAD, `select used from public.usage_counters where household_id = '${household}';`, options),
    "3",
    "a household should be able to see what it has used",
  );

  asProfile(HEAD, `update public.usage_counters set used = 0 where household_id = '${household}';`, options);
  assert.equal(
    psql(`select used from public.usage_counters where household_id = '${household}';`, options),
    "3",
    "a member reset their own meter",
  );
});

test("the counter increments rather than overwriting", () => {
  psql(`delete from public.usage_counters where household_id = '${household}';`, options);

  for (let i = 0; i < 4; i += 1) {
    psql(`select wh.record_usage('${household}', 'conversation.text', date_trunc('month', now()), 1, 10);`, options);
  }

  assert.equal(
    psql(
      `select used from public.usage_counters
       where household_id = '${household}' and feature_key = 'conversation.text';`,
      options,
    ),
    "4",
  );
});

test("the limit answer flips exactly at the allowance", () => {
  psql(`delete from public.usage_counters where household_id = '${household}';`, options);

  const spend = () =>
    psql(
      `select allowed from wh.record_usage('${household}', 'ai.agent_runs', date_trunc('month', now()), 1, 3);`,
      options,
    );

  assert.equal(spend(), "t");
  assert.equal(spend(), "t");
  assert.equal(spend(), "t");
  assert.equal(spend(), "f", "the fourth call against a limit of three must be refused");

  // The refused attempt is still counted: a meter that forgets attempts cannot
  // be reconciled against anything.
  assert.equal(
    psql(
      `select used from public.usage_counters
       where household_id = '${household}' and feature_key = 'ai.agent_runs';`,
      options,
    ),
    "4",
  );
});

test("concurrent requests cannot both spend the last unit", () => {
  psql(`delete from public.usage_counters where household_id = '${household}';`, options);

  // Twenty sessions racing for an allowance of ten, genuinely in parallel —
  // separate processes, separate connections, started together. Run in sequence
  // this would pass even with a read-then-write, which is the bug it exists to
  // catch.
  const statement = `select allowed from wh.record_usage('${household}', 'commerce.orders', date_trunc('month', now()), 1, 10);`;
  const output = execFileSync(
    "bash",
    [
      "-c",
      `seq 20 | xargs -P 20 -I{} psql -v ON_ERROR_STOP=1 -q -d ${DB} -tA -c "${statement.replace(/"/g, '\\"')}"`,
    ],
    { encoding: "utf8" },
  );

  const results = output.split("\n").map((line) => line.trim()).filter(Boolean);
  assert.equal(results.length, 20, "every session should have reported an answer");

  const granted = results.filter((value) => value === "t").length;
  assert.equal(granted, 10, `expected exactly 10 grants, got ${granted}`);
  assert.equal(
    psql(
      `select used from public.usage_counters
       where household_id = '${household}' and feature_key = 'commerce.orders';`,
      options,
    ),
    "20",
    "every attempt should be counted, granted or not",
  );
});

test("an integration is scoped to its household and writable only by an administrator", () => {
  asProfile(
    HEAD,
    `insert into public.integrations (household_id, kind, provider, status)
     values ('${household}', 'school', 'example_school', 'not_connected');`,
    options,
  );

  assert.equal(asProfile(HEAD, `select count(*) from public.integrations;`, options), "1");
  assert.equal(
    asProfile(OUTSIDER, `select count(*) from public.integrations;`, options),
    "0",
    "another household could see this connection",
  );

  assert.ok(
    deniedForProfile(
      OUTSIDER,
      `insert into public.integrations (household_id, kind, provider)
       values ('${household}', 'commerce', 'planted');`,
      options,
    ),
  );
});

test("one connection per provider, so two cursors cannot double-import", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.integrations (household_id, kind, provider)
       values ('${household}', 'school', 'example_school');`,
      options,
    ),
  );
});

test("a connection in error has to say what the error was", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.integrations set status = 'error', last_error_code = null
       where household_id = '${household}';`,
      options,
    ),
    "a connection reported failure with no reason recorded",
  );
});

test("provider events store identity and a hash, never the payload", () => {
  const integration = psql(
    `select id from public.integrations where household_id = '${household}';`,
    options,
  );

  psql(
    `insert into public.integration_events (household_id, integration_id, external_id, event_type, payload_hash)
     values ('${household}', '${integration}', 'assignment-1', 'assignment.created', '${"a".repeat(64)}');`,
    options,
  );

  // The same item arriving again reconciles onto the row already there.
  let duplicated = false;
  try {
    psql(
      `insert into public.integration_events (household_id, integration_id, external_id, event_type, payload_hash)
       values ('${household}', '${integration}', 'assignment-1', 'assignment.created', '${"a".repeat(64)}');`,
      options,
    );
    duplicated = true;
  } catch {
    duplicated = false;
  }
  assert.equal(duplicated, false, "the same provider record was imported twice");

  // A changed payload is new work rather than a duplicate.
  psql(
    `insert into public.integration_events (household_id, integration_id, external_id, event_type, payload_hash)
     values ('${household}', '${integration}', 'assignment-1', 'assignment.updated', '${"b".repeat(64)}');`,
    options,
  );

  assert.equal(psql(`select count(*) from public.integration_events;`, options), "2");

  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.integration_events (household_id, integration_id, external_id, event_type, payload_hash)
       values ('${household}', '${integration}', 'forged', 'assignment.created', '${"c".repeat(64)}');`,
      options,
    ),
    "a member forged a provider event",
  );
});
