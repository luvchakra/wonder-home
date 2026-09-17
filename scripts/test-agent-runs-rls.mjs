#!/usr/bin/env node
/**
 * Agent run and approval tests (stories 14-004, 14-005).
 *
 * The governed boundary is only real if a client cannot step around it. These
 * assert that nothing reachable from a browser can create a run, approve its
 * own action, or hide a refusal.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_agents_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";

let household = "";
let headMember = "";
let adultMember = "";
let run = "";

function approval(fingerprint, { status = "pending", expiresIn = "1 hour" } = {}) {
  return psql(
    `insert into public.approvals
       (household_id, agent_run_id, action_type, action_fingerprint, summary, status, expires_at)
     values ('${household}', '${run}', 'bills.pay', '${fingerprint}',
             'Pay the electricity bill', '${status}', now() + interval '${expiresIn}')
     returning id;`,
    options,
  );
}

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");

  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya');`, options);
  adultMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(
    `insert into public.household_roles (household_id, member_id, role)
     values ('${household}', '${adultMember}', 'adult');`,
    options,
  );

  run = psql(
    `insert into public.agent_runs (household_id, initiating_member_id, agent_type, summary)
     values ('${household}', '${headMember}', 'household.orchestrator', 'Checking outcomes at risk')
     returning id;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a member can see what WonderHome did for their household", () => {
  assert.equal(
    asProfile(ADULT, `select count(*) from public.agent_runs where id = '${run}';`, options),
    "1",
  );
});

test("a client cannot start an agent run", () => {
  let rejected = false;
  try {
    asProfile(
      HEAD,
      `insert into public.agent_runs (household_id, agent_type) values ('${household}', 'rogue.agent');`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "a client started an agent run");
});

test("a client cannot rewrite a run's summary to hide what happened", () => {
  asProfile(
    HEAD,
    `update public.agent_runs set summary = 'nothing to see here' where id = '${run}';`,
    options,
  );
  assert.equal(
    psql(`select summary from public.agent_runs where id = '${run}';`, options),
    "Checking outcomes at risk",
  );
});

test("a client cannot approve an action by writing to the table", () => {
  const id = approval("bills.pay(amountMinor=284000,bill=electricity)");

  asProfile(
    HEAD,
    `update public.approvals set status = 'approved', decided_at = now() where id = '${id}';`,
    options,
  );

  assert.equal(
    psql(`select status from public.approvals where id = '${id}';`, options),
    "pending",
    "a member approved an action directly",
  );
});

test("one pending approval per action, so the same question is not asked twice", () => {
  const fingerprint = "bills.pay(amountMinor=120000,bill=water)";
  approval(fingerprint);

  let rejected = false;
  try {
    approval(fingerprint);
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "the household was asked the same question twice");
});

test("a different amount is a different question", () => {
  approval("bills.pay(amountMinor=500000,bill=internet)");
  // Same bill, different amount: this must be askable separately.
  assert.ok(approval("bills.pay(amountMinor=600000,bill=internet)"));
});

test("an approval must expire", () => {
  let rejected = false;
  try {
    psql(
      `insert into public.approvals
         (household_id, action_type, action_fingerprint, summary, created_at, expires_at)
       values ('${household}', 'bills.pay', 'x', 'Never expires', now(), now() - interval '1 second');`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "an approval was created that expires before it exists");
});

test("refused tool calls are recorded, not just successful ones", () => {
  psql(
    `insert into public.agent_tool_calls (household_id, agent_run_id, tool_name, outcome, refusal_code, reason)
     values ('${household}', '${run}', 'bills.pay', 'refused', 'missing_permission',
             'Pay a bill the household owes is not something this member may do');`,
    options,
  );

  assert.equal(
    asProfile(
      HEAD,
      `select count(*) from public.agent_tool_calls where outcome = 'refused';`,
      options,
    ),
    "1",
  );
});

test("the tool-call detail is an administrator's view", () => {
  assert.equal(
    asProfile(ADULT, `select count(*) from public.agent_tool_calls;`, options),
    "0",
    "an ordinary member saw operational tool-call detail",
  );
});

test("a client cannot delete the record of a refusal", () => {
  asProfile(HEAD, `delete from public.agent_tool_calls;`, options);
  assert.equal(psql(`select count(*) from public.agent_tool_calls;`, options), "1");
});

test("runs and approvals do not cross household boundaries", () => {
  psql(
    `insert into auth.users (id, email) values ('33333333-3333-4333-8333-333333333333', 'o@example.test');`,
    options,
  );
  const [otherHousehold] = asProfile(
    "33333333-3333-4333-8333-333333333333",
    `select household_id || ' ' || member_id from wh.create_household('Other Home', 'Outsider');`,
    options,
  ).split(" ");

  assert.equal(
    asProfile(
      "33333333-3333-4333-8333-333333333333",
      `select count(*) from public.agent_runs where household_id = '${household}';`,
      options,
    ),
    "0",
  );
  assert.notEqual(otherHousehold, household);
});
