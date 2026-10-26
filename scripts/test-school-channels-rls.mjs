#!/usr/bin/env node
/**
 * The school channels a household tracks (story 08-031).
 *
 * A channel is part of a school connection, an administrator's to set up:
 * only an Admin may add, change or remove one. Every member of the household
 * may see which channels are tracked — except a channel tied to one child,
 * which only those who may see that child (a guardian, an Admin, the child)
 * read. Another household sees nothing at all.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_school_channels_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const KID = "44444444-4444-4444-8444-444444444444";

let household = "";
let headMember = "";
let adultMember = "";
let child = "";
let integration = "";
let outsiderHousehold = "";
let outsiderIntegration = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${ADULT}', 'priya@example.test'), ('${OUTSIDER}', 'olu@example.test'), ('${KID}', 'anaya@example.test');`,
    options,
  );
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya'), ('${KID}', 'Anaya');`, options);
  adultMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${adultMember}', 'adult');`, options);
  // Kunal is Anaya's guardian; Priya, an adult of the household, is not.
  child = asProfile(HEAD, `select wh.create_child_member('${household}', 'Anaya', '2016-09-18', array['${headMember}']::uuid[]);`, options);
  psql(`update public.household_members set profile_id = '${KID}' where id = '${child}';`, options);
  // A school connection to hang channels on (service role; sessions never write integrations directly here).
  integration = psql(
    `insert into public.integrations (household_id, kind, provider, status) values ('${household}', 'school', 'loop-learning', 'connecting') returning id;`,
    options,
  );
  outsiderHousehold = asProfile(OUTSIDER, `select household_id from wh.create_household('Other Home', 'Olu');`, options);
  outsiderIntegration = psql(
    `insert into public.integrations (household_id, kind, provider, status) values ('${outsiderHousehold}', 'school', 'loop-learning', 'connecting') returning id;`,
    options,
  );
});

test("an Admin adds a household channel and a child-specific one", () => {
  const generic = asProfile(
    HEAD,
    `insert into public.school_channels (household_id, integration_id, provider, channel_id, url, created_by) values ('${household}', '${integration}', 'loop-learning', '2044541', 'https://www.looplearning.com/channel/2044541', '${headMember}') returning id;`,
    options,
  );
  assert.match(generic, /[0-9a-f-]{36}/);
  const forChild = asProfile(
    HEAD,
    `insert into public.school_channels (household_id, integration_id, provider, channel_id, url, child_member_id, created_by) values ('${household}', '${integration}', 'loop-learning', '7', 'https://www.looplearning.com/channel/7', '${child}', '${headMember}') returning id;`,
    options,
  );
  assert.match(forChild, /[0-9a-f-]{36}/);
});

test("a non-admin adult cannot add a channel", () => {
  assert.throws(() =>
    asProfile(
      ADULT,
      `insert into public.school_channels (household_id, integration_id, provider, channel_id, url, created_by) values ('${household}', '${integration}', 'loop-learning', '999', 'https://www.looplearning.com/channel/999', '${adultMember}') returning id;`,
      options,
    ),
  );
});

test("a non-admin adult sees household channels but not a child they cannot see", () => {
  const rows = asProfile(ADULT, `select channel_id from public.school_channels order by channel_id;`, options);
  // Priya sees the generic channel (2044541) but not the child-tied one (7).
  assert.match(rows, /2044541/);
  assert.doesNotMatch(rows, /^7$|\n7$|\b7\b/);
});

test("the child's guardian sees the child-specific channel", () => {
  const rows = asProfile(HEAD, `select channel_id from public.school_channels order by channel_id;`, options);
  assert.match(rows, /2044541/);
  assert.match(rows, /\b7\b/);
});

test("another household sees nothing here, and cannot add into ours", () => {
  const rows = asProfile(OUTSIDER, `select count(*) from public.school_channels;`, options);
  assert.equal(rows.trim(), "0");
  assert.throws(() =>
    asProfile(
      OUTSIDER,
      `insert into public.school_channels (household_id, integration_id, provider, channel_id, url, created_by) values ('${household}', '${integration}', 'loop-learning', 'x', 'https://www.looplearning.com/channel/x', '${headMember}') returning id;`,
      options,
    ),
  );
  // And cannot hang a channel off their own connection pointed at our household.
  assert.throws(() =>
    asProfile(
      OUTSIDER,
      `insert into public.school_channels (household_id, integration_id, provider, channel_id, url) values ('${household}', '${outsiderIntegration}', 'loop-learning', 'y', 'https://www.looplearning.com/channel/y') returning id;`,
      options,
    ),
  );
});

test("an Admin stops a channel; a non-admin cannot", () => {
  asProfile(HEAD, `update public.school_channels set active = false where channel_id = '2044541' and household_id = '${household}';`, options);
  const stopped = asProfile(HEAD, `select active from public.school_channels where channel_id = '2044541' and household_id = '${household}';`, options);
  assert.match(stopped, /^f/);
  // A non-admin's update matches no rows (RLS), so the value is unchanged.
  asProfile(ADULT, `update public.school_channels set active = true where channel_id = '2044541' and household_id = '${household}';`, options);
  const still = asProfile(HEAD, `select active from public.school_channels where channel_id = '2044541' and household_id = '${household}';`, options);
  assert.match(still, /^f/);
});

after(() => {
  psql(`drop database if exists ${DB} with (force);`, { database: "postgres" });
});
