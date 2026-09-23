#!/usr/bin/env node
/**
 * Health fitness goals & sessions (story 21-008): the same
 * self/guardian/household_operational/consented-viewer RLS shape every
 * other health entity in this module already proves, for
 * `health_fitness_goals` and `health_fitness_sessions`, plus what is unique
 * to these two tables: the target_count / duration_minutes check
 * constraints, the custom_label requirement, the distance value/unit
 * pairing, and `health_fitness_sessions.goal_id` linking a session back to
 * the goal it counts toward.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_health_fitness_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let partnerMember = "";
let childMember = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'), ('${PARTNER}', 'priya@example.test'), ('${OUTSIDER}', 'outsider@example.test');`,
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
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${partnerMember}', 'adult');`, options);

  childMember = psql(
    `insert into public.household_members (household_id, member_type, display_name)
     values ('${household}', 'child', 'Kiddo') returning id;`,
    options,
  );
  psql(
    `insert into public.member_guardians (household_id, child_member_id, guardian_member_id)
     values ('${household}', '${childMember}', '${headMember}');`,
    options,
  );

  asProfile(OUTSIDER, `select wh.create_household('Outsider Home', 'Outsider');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

function createGoal(profileId, memberId, scope = "private") {
  asProfile(
    profileId,
    `insert into public.health_fitness_goals (household_id, member_id, activity_type, target_count, frequency_period, privacy_scope, created_by_member_id)
     values ('${household}', '${memberId}', 'walk', 3, 'week', '${scope}', '${memberId}');`,
    options,
  );
  return psql(
    `select id from public.health_fitness_goals where member_id = '${memberId}' and privacy_scope = '${scope}' order by created_at desc limit 1;`,
    options,
  );
}

function createSession(profileId, memberId, scope = "private") {
  asProfile(
    profileId,
    `insert into public.health_fitness_sessions (household_id, member_id, activity_type, duration_minutes, privacy_scope, created_by_member_id)
     values ('${household}', '${memberId}', 'walk', 30, '${scope}', '${memberId}');`,
    options,
  );
  return psql(
    `select id from public.health_fitness_sessions where member_id = '${memberId}' and privacy_scope = '${scope}' order by created_at desc limit 1;`,
    options,
  );
}

test("a member can create and read their own private goal and session", () => {
  const goalId = createGoal(PARTNER, partnerMember);
  assert.equal(asProfile(PARTNER, `select id from public.health_fitness_goals where id = '${goalId}';`, options), goalId);

  const sessionId = createSession(PARTNER, partnerMember);
  assert.equal(asProfile(PARTNER, `select id from public.health_fitness_sessions where id = '${sessionId}';`, options), sessionId);
});

test("the household administrator cannot read another adult's private goal or session", () => {
  const goalId = psql(`select id from public.health_fitness_goals where member_id = '${partnerMember}' and privacy_scope = 'private';`, options);
  assert.equal(
    asProfile(HEAD, `select id from public.health_fitness_goals where id = '${goalId}';`, options),
    "",
    "the household administrator could read another adult's private goal",
  );
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_fitness_goals where id = '${goalId}';`, options), "0");

  const sessionId = psql(`select id from public.health_fitness_sessions where member_id = '${partnerMember}' and privacy_scope = 'private';`, options);
  assert.equal(
    asProfile(HEAD, `select id from public.health_fitness_sessions where id = '${sessionId}';`, options),
    "",
    "the household administrator could read another adult's private session",
  );
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_fitness_sessions where id = '${sessionId}';`, options), "0");
});

test("the household administrator cannot write another adult's private goal or session via WHERE either", () => {
  const goalId = psql(`select id from public.health_fitness_goals where member_id = '${partnerMember}' and privacy_scope = 'private';`, options);
  assert.ok(
    deniedForUpdate(
      HEAD,
      `update public.health_fitness_goals set status = 'dismissed' where id = '${goalId}';`,
      `select status from public.health_fitness_goals where id = '${goalId}';`,
      "active",
      options,
    ),
    "the household administrator could dismiss another adult's private goal",
  );

  const sessionId = psql(`select id from public.health_fitness_sessions where member_id = '${partnerMember}' and privacy_scope = 'private';`, options);
  assert.ok(
    deniedForUpdate(
      HEAD,
      `update public.health_fitness_sessions set status = 'archived' where id = '${sessionId}';`,
      `select status from public.health_fitness_sessions where id = '${sessionId}';`,
      "active",
      options,
    ),
    "the household administrator could archive another adult's private session",
  );
});

test("household_operational scope is visible to any member", () => {
  const goalId = createGoal(PARTNER, partnerMember, "household_operational");
  assert.equal(asProfile(HEAD, `select id from public.health_fitness_goals where id = '${goalId}';`, options), goalId);
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_fitness_goals where id = '${goalId}';`, options), "0");

  const sessionId = createSession(PARTNER, partnerMember, "household_operational");
  assert.equal(asProfile(HEAD, `select id from public.health_fitness_sessions where id = '${sessionId}';`, options), sessionId);
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.health_fitness_sessions where id = '${sessionId}';`, options), "0");
});

test("a guardian can see and manage their child's goal and session regardless of scope", () => {
  const goalId = createGoal(HEAD, childMember, "private");
  assert.equal(asProfile(HEAD, `select id from public.health_fitness_goals where id = '${goalId}';`, options), goalId);
  assert.ok(
    !deniedForUpdate(
      HEAD,
      `update public.health_fitness_goals set status = 'dismissed' where id = '${goalId}';`,
      `select status from public.health_fitness_goals where id = '${goalId}';`,
      "active",
      options,
    ),
    "a guardian could not dismiss the child they guard's goal",
  );

  const sessionId = createSession(HEAD, childMember, "private");
  assert.equal(asProfile(HEAD, `select id from public.health_fitness_sessions where id = '${sessionId}';`, options), sessionId);
  assert.ok(
    !deniedForUpdate(
      HEAD,
      `update public.health_fitness_sessions set status = 'archived' where id = '${sessionId}';`,
      `select status from public.health_fitness_sessions where id = '${sessionId}';`,
      "active",
      options,
    ),
    "a guardian could not archive the child they guard's session",
  );
});

test("a non-guardian adult cannot see or manage a child's goal or session", () => {
  const goalId = psql(`select id from public.health_fitness_goals where member_id = '${childMember}';`, options);
  assert.equal(
    asProfile(PARTNER, `select id from public.health_fitness_goals where id = '${goalId}';`, options),
    "",
    "a non-guardian adult could read a child's goal",
  );

  const sessionId = psql(`select id from public.health_fitness_sessions where member_id = '${childMember}';`, options);
  assert.equal(asProfile(PARTNER, `select id from public.health_fitness_sessions where id = '${sessionId}';`, options), "", "a non-guardian adult could read a child's session");
});

test("selected_family visibility requires the same consent grant health_profiles uses", () => {
  const goalId = createGoal(PARTNER, partnerMember, "selected_family");
  assert.equal(
    asProfile(HEAD, `select id from public.health_fitness_goals where id = '${goalId}';`, options),
    "",
    "selected_family was visible on a goal with no consent granted",
  );

  const sessionId = createSession(PARTNER, partnerMember, "selected_family");
  assert.equal(
    asProfile(HEAD, `select id from public.health_fitness_sessions where id = '${sessionId}';`, options),
    "",
    "selected_family was visible on a session with no consent granted",
  );

  asProfile(
    PARTNER,
    `insert into public.health_consents (household_id, subject_member_id, viewer_member_id, granted_by_member_id)
     values ('${household}', '${partnerMember}', '${headMember}', '${partnerMember}');`,
    options,
  );
  assert.equal(asProfile(HEAD, `select id from public.health_fitness_goals where id = '${goalId}';`, options), goalId);
  assert.equal(asProfile(HEAD, `select id from public.health_fitness_sessions where id = '${sessionId}';`, options), sessionId);
});

test("the target_count and duration_minutes constraints refuse zero or a negative value", () => {
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.health_fitness_goals (household_id, member_id, activity_type, target_count, frequency_period, created_by_member_id)
       values ('${household}', '${partnerMember}', 'run', 0, 'week', '${partnerMember}');`,
      options,
    ),
    "a goal with a zero target_count was accepted",
  );
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.health_fitness_sessions (household_id, member_id, activity_type, duration_minutes, created_by_member_id)
       values ('${household}', '${partnerMember}', 'run', -5, '${partnerMember}');`,
      options,
    ),
    "a session with a negative duration_minutes was accepted",
  );
});

test("an 'other' activity_type requires a custom_label, on both tables", () => {
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.health_fitness_goals (household_id, member_id, activity_type, target_count, frequency_period, created_by_member_id)
       values ('${household}', '${partnerMember}', 'other', 2, 'week', '${partnerMember}');`,
      options,
    ),
    "an 'other' goal with no custom_label was accepted",
  );
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.health_fitness_sessions (household_id, member_id, activity_type, duration_minutes, created_by_member_id)
       values ('${household}', '${partnerMember}', 'other', 20, '${partnerMember}');`,
      options,
    ),
    "an 'other' session with no custom_label was accepted",
  );
});

test("a session's distance_value and distance_unit must be given together", () => {
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.health_fitness_sessions (household_id, member_id, activity_type, duration_minutes, distance_value, created_by_member_id)
       values ('${household}', '${partnerMember}', 'run', 25, 5, '${partnerMember}');`,
      options,
    ),
    "a session with a distance_value but no distance_unit was accepted",
  );
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.health_fitness_sessions (household_id, member_id, activity_type, duration_minutes, distance_unit, created_by_member_id)
       values ('${household}', '${partnerMember}', 'run', 25, 'km', '${partnerMember}');`,
      options,
    ),
    "a session with a distance_unit but no distance_value was accepted",
  );
});

test("health_fitness_sessions.goal_id links a session to a goal within the same household", () => {
  const goalId = psql(`select id from public.health_fitness_goals where member_id = '${partnerMember}' and privacy_scope = 'household_operational';`, options);
  asProfile(
    PARTNER,
    `insert into public.health_fitness_sessions (household_id, member_id, goal_id, activity_type, duration_minutes, privacy_scope, created_by_member_id)
     values ('${household}', '${partnerMember}', '${goalId}', 'walk', 30, 'private', '${partnerMember}');`,
    options,
  );
  const linkedCount = psql(`select count(*) from public.health_fitness_sessions where goal_id = '${goalId}';`, options);
  assert.equal(linkedCount, "1");
});

test("provider_id defaults to manual and accepts the full declared domain, live or not", () => {
  asProfile(
    PARTNER,
    `insert into public.health_fitness_goals (household_id, member_id, activity_type, target_count, frequency_period, provider_id, created_by_member_id)
     values ('${household}', '${partnerMember}', 'yoga', 2, 'week', 'apple_health_kit', '${partnerMember}');`,
    options,
  );
  const providerId = psql(
    `select provider_id from public.health_fitness_goals where member_id = '${partnerMember}' and activity_type = 'yoga';`,
    options,
  );
  assert.equal(providerId, "apple_health_kit", "the schema should declare the inert provider even though the app layer refuses to write through it");

  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.health_fitness_goals (household_id, member_id, activity_type, target_count, frequency_period, provider_id, created_by_member_id)
       values ('${household}', '${partnerMember}', 'run', 2, 'week', 'not_a_real_provider', '${partnerMember}');`,
      options,
    ),
    "an unrecognized provider_id was accepted",
  );
});
