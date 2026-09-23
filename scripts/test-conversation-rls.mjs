#!/usr/bin/env node
/**
 * Conversation privacy tests (stories 04-001, 04-007, 15-003).
 *
 * The story requires that conversation state "does not leak private adult or
 * child conversations into shared household context". That is a boundary
 * *inside* a household rather than between households, so it needs its own
 * assertions: everyone here is a legitimate member, and the question is what
 * they can see of each other.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_conversation_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";

let household = "";
let headMember = "";
let partnerMember = "";
let childMember = "";
let privateSession = "";
let sharedSession = "";
let childSession = "";

function startSession(memberId, { visibility = "private", channel = "text" } = {}) {
  const id = psql(
    `insert into public.conversation_sessions (household_id, member_id, channel, visibility)
     values ('${household}', '${memberId}', '${channel}', '${visibility}') returning id;`,
    options,
  );
  psql(
    `insert into public.conversation_messages (household_id, session_id, role, content)
     values ('${household}', '${id}', 'member', 'something said in a ${visibility} session');`,
    options,
  );
  psql(
    `insert into public.conversation_actions (household_id, session_id, action_type, payload)
     values ('${household}', '${id}', 'record.absence', '{}'::jsonb);`,
    options,
  );
  return id;
}

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'), ('${PARTNER}', 'priya@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");

  psql(`insert into public.profiles (id, display_name) values ('${PARTNER}', 'Priya');`, options);
  partnerMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${PARTNER}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(
    `insert into public.household_roles (household_id, member_id, role)
     values ('${household}', '${partnerMember}', 'adult');`,
    options,
  );

  childMember = asProfile(
    HEAD,
    `select wh.create_child_member('${household}', 'Anaya', '2016-09-18', array['${headMember}']::uuid[]);`,
    options,
  );

  privateSession = startSession(headMember);
  sharedSession = startSession(headMember, { visibility: "household" });
  childSession = startSession(childMember);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a member sees their own conversation", () => {
  const rows = asProfile(
    HEAD,
    `select id from public.conversation_sessions where id = '${privateSession}';`,
    options,
  );
  assert.equal(rows, privateSession);
});

test("one adult's private conversation is invisible to the other", () => {
  assert.equal(
    asProfile(
      PARTNER,
      `select count(*) from public.conversation_sessions where id = '${privateSession}';`,
      options,
    ),
    "0",
    "a private conversation was readable by another adult in the same household",
  );
});

test("the messages inside a private conversation are invisible too", () => {
  assert.equal(
    asProfile(
      PARTNER,
      `select count(*) from public.conversation_messages where session_id = '${privateSession}';`,
      options,
    ),
    "0",
    "private message content leaked to another member",
  );
});

test("proposed actions inherit the conversation's privacy", () => {
  assert.equal(
    asProfile(
      PARTNER,
      `select count(*) from public.conversation_actions where session_id = '${privateSession}';`,
      options,
    ),
    "0",
  );
});

test("a conversation shared with the household is visible to the household", () => {
  assert.equal(
    asProfile(
      PARTNER,
      `select count(*) from public.conversation_sessions where id = '${sharedSession}';`,
      options,
    ),
    "1",
  );
  assert.equal(
    asProfile(
      PARTNER,
      `select count(*) from public.conversation_messages where session_id = '${sharedSession}';`,
      options,
    ),
    "1",
  );
});

test("a child's conversation is not readable by an adult who is not them", () => {
  // Guardianship governs a child's plans and school work, not a private
  // conversation they had. Widening that is a product decision, not a default.
  assert.equal(
    asProfile(
      PARTNER,
      `select count(*) from public.conversation_sessions where id = '${childSession}';`,
      options,
    ),
    "0",
  );
});

test("conversations are private by default, not by remembering to ask", () => {
  const id = psql(
    `insert into public.conversation_sessions (household_id, member_id, channel)
     values ('${household}', '${headMember}', 'voice') returning id;`,
    options,
  );
  assert.equal(
    psql(`select visibility from public.conversation_sessions where id = '${id}';`, options),
    "private",
  );
});

test("nobody can fabricate a conversation from a browser session", () => {
  let rejected = false;
  try {
    asProfile(
      PARTNER,
      `insert into public.conversation_sessions (household_id, member_id, channel)
       values ('${household}', '${partnerMember}', 'text');`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "a client created a conversation session directly");
});

test("nobody can approve their own proposal by writing to the table", () => {
  assert.ok(
    deniedForUpdate(
      HEAD,
      `update public.conversation_actions set approval_status = 'approved'
       where session_id = '${privateSession}';`,
      `select approval_status from public.conversation_actions where session_id = '${privateSession}';`,
      "proposed",
      options,
    ),
    "a client approved its own proposed action",
  );
});

test("a rejected or expired proposal never executes — not even through the service role (AG-005)", () => {
  for (const closed of ["rejected", "expired"]) {
    const id = psql(
      `insert into public.conversation_actions (household_id, session_id, action_type, payload, approval_status)
       values ('${household}', '${sharedSession}', 'make_payment', '{}'::jsonb, 'proposed') returning id;`,
      options,
    );
    psql(`update public.conversation_actions set approval_status = '${closed}' where id = '${id}';`, options);
    for (const next of ["approved", "executed", "proposed", "failed"]) {
      assert.throws(() => psql(`update public.conversation_actions set approval_status = '${next}' where id = '${id}';`, options), /cannot become/, `${closed} became ${next}`);
    }
    assert.equal(psql(`select approval_status from public.conversation_actions where id = '${id}';`, options), closed);
    // Its record may still be annotated; only the decision is fixed.
    psql(`update public.conversation_actions set result = '{"note":"kept"}'::jsonb where id = '${id}';`, options);
  }
});

test("an approved proposal still runs to executed or failed", () => {
  const id = psql(
    `insert into public.conversation_actions (household_id, session_id, action_type, payload, approval_status)
     values ('${household}', '${sharedSession}', 'add_to_list', '{}'::jsonb, 'proposed') returning id;`,
    options,
  );
  psql(`update public.conversation_actions set approval_status = 'approved' where id = '${id}';`, options);
  psql(`update public.conversation_actions set approval_status = 'executed' where id = '${id}';`, options);
  assert.equal(psql(`select approval_status from public.conversation_actions where id = '${id}';`, options), "executed");
});

test("a session cannot be opened for a member of another household", () => {
  // profiles.id references auth.users, so the account has to exist first.
  psql(
    `insert into auth.users (id, email)
     values ('33333333-3333-4333-8333-333333333333', 'outsider@example.test');`,
    options,
  );
  const outsiderMember = psql(
    `insert into public.profiles (id, display_name)
     values ('33333333-3333-4333-8333-333333333333', 'Outsider') returning id;`,
    options,
  );
  const otherHousehold = psql(
    `insert into public.households (name) values ('Other Home') returning id;`,
    options,
  );
  const otherMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${otherHousehold}', '${outsiderMember}', 'adult', 'Outsider') returning id;`,
    options,
  );

  let rejected = false;
  try {
    psql(
      `insert into public.conversation_sessions (household_id, member_id, channel)
       values ('${household}', '${otherMember}', 'text');`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "a session was opened for someone in another household");
});

test("one live memory per key, with history preserved", () => {
  psql(
    `insert into public.memories (household_id, scope, category, key, value, source_type, status)
     values ('${household}', 'household', 'preference', 'meals.dinner',
             '{"time": "20:00"}'::jsonb, 'conversation', 'learned');`,
    options,
  );

  let rejected = false;
  try {
    psql(
      `insert into public.memories (household_id, scope, category, key, value, source_type, status)
       values ('${household}', 'household', 'preference', 'meals.dinner',
               '{"time": "19:30"}'::jsonb, 'conversation', 'learned');`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "two live beliefs existed for one key");

  psql(
    `update public.memories set status = 'superseded'
     where household_id = '${household}' and key = 'meals.dinner';
     insert into public.memories (household_id, scope, category, key, value, source_type, status)
     values ('${household}', 'household', 'preference', 'meals.dinner',
             '{"time": "19:30"}'::jsonb, 'conversation', 'confirmed');`,
    options,
  );

  assert.equal(
    psql(
      `select count(*) from public.memories where household_id = '${household}' and key = 'meals.dinner';`,
      options,
    ),
    "2",
    "the previous belief was lost rather than kept as history",
  );
});

test("a member-scoped memory needs a member, and a household one must not have it", () => {
  for (const bad of [
    `('${household}', 'member', 'preference', 'private.thing', '{}'::jsonb, 'conversation', null)`,
    `('${household}', 'household', 'preference', 'other.thing', '{}'::jsonb, 'conversation', '${headMember}')`,
  ]) {
    let rejected = false;
    try {
      psql(
        `insert into public.memories (household_id, scope, category, key, value, source_type, member_id)
         values ${bad};`,
        options,
      );
    } catch {
      rejected = true;
    }
    assert.ok(rejected, `an inconsistent memory scope was accepted: ${bad}`);
  }
});
