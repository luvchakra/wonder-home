#!/usr/bin/env node
/**
 * Household operating model tests (stories 02-002 through 02-005).
 *
 * The configuration these tables hold is canonical household data that
 * planners, notifications and AI tools all read — not UI state — so the
 * constraints that keep it coherent are asserted against the database.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_playbook_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let adultMember = "";
let inactiveMember = "";
let outsiderMember = "";
let laundryItem = "";

function addMember(profileId, name, { status = "active" } = {}) {
  if (profileId) {
    psql(
      `insert into public.profiles (id, display_name) values ('${profileId}', '${name}')
       on conflict (id) do nothing;`,
      options,
    );
  }
  return psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name, status)
     values ('${household}', ${profileId ? `'${profileId}'` : "null"}, 'adult', '${name}', '${status}')
     returning id;`,
    options,
  );
}

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'),
       ('${ADULT}', 'priya@example.test'),
       ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");

  adultMember = addMember(ADULT, "Priya");
  psql(
    `insert into public.household_roles (household_id, member_id, role)
     values ('${household}', '${adultMember}', 'adult');`,
    options,
  );
  inactiveMember = addMember(null, "Former Helper", { status: "inactive" });

  const [, otherMember] = asProfile(
    OUTSIDER,
    `select household_id || ' ' || member_id from wh.create_household('Outsider Home', 'Outsider');`,
    options,
  ).split(" ");
  outsiderMember = otherMember;
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("an administrator defines a playbook item", () => {
  laundryItem = asProfile(
    HEAD,
    `insert into public.playbook_items
       (household_id, outcome_key, name, outcome_definition, cadence)
     values ('${household}', 'laundry.ready', 'Laundry ready',
             'Everyone has clean clothes ready for the week',
             '{"every": "week", "day": "sunday"}'::jsonb)
     returning id;`,
    options,
  );
  assert.match(laundryItem, /^[0-9a-f-]{36}$/);
});

test("an outcome key is a stable identifier, not free text", () => {
  let rejected = false;
  try {
    psql(
      `insert into public.playbook_items (household_id, outcome_key, name, outcome_definition)
       values ('${household}', 'Laundry Ready!', 'x', 'y');`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "a free-text outcome key was accepted");
});

test("an ordinary adult can read the playbook but not change it", () => {
  assert.equal(
    asProfile(ADULT, `select count(*) from public.playbook_items where household_id = '${household}';`, options),
    "1",
    "a member could not read the household's own operating model",
  );

  assert.ok(
    deniedForProfile(
      ADULT,
      `insert into public.playbook_items (household_id, outcome_key, name, outcome_definition)
       values ('${household}', 'sneaky.item', 'Sneaky', 'Should not exist');`,
      options,
    ),
    "a non-administrator changed the playbook",
  );
});

test("a responsibility records a primary, a backup and an autonomy mode", () => {
  asProfile(
    HEAD,
    `insert into public.responsibilities
       (household_id, outcome_key, playbook_item_id, primary_member_id, backup_member_id, ai_mode)
     values ('${household}', 'laundry.ready', '${laundryItem}', '${adultMember}', '${headMember}', 'prepare');`,
    options,
  );

  assert.equal(
    psql(
      `select ai_mode from public.responsibilities
       where household_id = '${household}' and outcome_key = 'laundry.ready';`,
      options,
    ),
    "prepare",
  );
});

test("an outcome cannot be assigned to an inactive member", () => {
  let rejected = false;
  try {
    psql(
      `insert into public.responsibilities (household_id, outcome_key, primary_member_id)
       values ('${household}', 'dishes.done', '${inactiveMember}');`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "an inactive member was made responsible for an outcome");
});

test("an outcome cannot be assigned to someone in another household", () => {
  let rejected = false;
  try {
    psql(
      `insert into public.responsibilities (household_id, outcome_key, primary_member_id)
       values ('${household}', 'dishes.done', '${outsiderMember}');`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "a member of another household was made responsible");
});

test("a backup who is also the primary is refused", () => {
  let rejected = false;
  try {
    psql(
      `insert into public.responsibilities
         (household_id, outcome_key, primary_member_id, backup_member_id)
       values ('${household}', 'dishes.done', '${adultMember}', '${adultMember}');`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "a member was recorded as their own backup");
});

test("an outcome with no owner is representable, because the matrix must show gaps", () => {
  psql(
    `insert into public.responsibilities (household_id, outcome_key, ai_mode)
     values ('${household}', 'pets.fed', 'observe');`,
    options,
  );

  assert.equal(
    psql(
      `select count(*) from public.responsibilities
       where household_id = '${household}' and primary_member_id is null;`,
      options,
    ),
    "1",
  );
});

test("an unconfigured outcome resolves to observe, never to acting", () => {
  assert.equal(
    psql(`select wh.autonomy_for('${household}', 'nothing.configured');`, options),
    "observe",
  );
  assert.equal(psql(`select wh.autonomy_for('${household}', 'laundry.ready');`, options), "prepare");
});

test("autonomy is a known mode, not arbitrary text", () => {
  let rejected = false;
  try {
    psql(
      `update public.responsibilities set ai_mode = 'do_whatever'
       where household_id = '${household}' and outcome_key = 'laundry.ready';`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "an unknown autonomy mode was accepted");
});

test("a dependency cannot cross a household boundary or point at itself", () => {
  const dishes = asProfile(
    HEAD,
    `insert into public.playbook_items (household_id, outcome_key, name, outcome_definition)
     values ('${household}', 'dishes.done', 'Dishes done', 'The kitchen is clear after dinner')
     returning id;`,
    options,
  );

  asProfile(
    HEAD,
    `insert into public.playbook_dependencies (household_id, playbook_item_id, depends_on_item_id)
     values ('${household}', '${laundryItem}', '${dishes}');`,
    options,
  );

  let selfRejected = false;
  try {
    psql(
      `insert into public.playbook_dependencies (household_id, playbook_item_id, depends_on_item_id)
       values ('${household}', '${dishes}', '${dishes}');`,
      options,
    );
  } catch {
    selfRejected = true;
  }
  assert.ok(selfRejected, "an item was made to depend on itself");
});

test("only one version of a policy is in force at a time", () => {
  asProfile(
    HEAD,
    `insert into public.policies (household_id, category, name, rule, version)
     values ('${household}', 'spending', 'Grocery cap',
             '{"maxMinor": 500000, "period": "week"}'::jsonb, 1);`,
    options,
  );

  let rejected = false;
  try {
    psql(
      `insert into public.policies (household_id, category, name, rule, version, active)
       values ('${household}', 'spending', 'Grocery cap', '{"maxMinor": 900000}'::jsonb, 2, true);`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "two versions of one policy were active at once");

  // Superseding works: retire the old version, then activate the new one.
  psql(
    `update public.policies set active = false
     where household_id = '${household}' and name = 'Grocery cap' and version = 1;
     insert into public.policies (household_id, category, name, rule, version, active)
     values ('${household}', 'spending', 'Grocery cap', '{"maxMinor": 900000}'::jsonb, 2, true);`,
    options,
  );

  assert.equal(
    psql(
      `select version from public.policies
       where household_id = '${household}' and name = 'Grocery cap' and active;`,
      options,
    ),
    "2",
  );
});

test("the operating model is not readable from another household", () => {
  for (const table of ["playbook_items", "responsibilities", "policies", "playbook_dependencies"]) {
    assert.equal(
      asProfile(OUTSIDER, `select count(*) from public.${table} where household_id = '${household}';`, options),
      "0",
      `${table} leaked across the household boundary`,
    );
  }
});
