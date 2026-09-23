#!/usr/bin/env node
/**
 * Maintenance, laundry and pet care database tests (module 13).
 *
 * Three things are worth proving at this level rather than in a unit test,
 * because each of them is a rule the application layer could forget:
 *
 *   1. Another household cannot see or touch any of it.
 *   2. A foreign key that points at the right table but the wrong household is
 *      rejected — the triggers, not the references, are what enforce that.
 *   3. A member cannot write a device signal. Evidence a member can manufacture
 *      is not evidence, and the absence of an insert policy is the control.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForAnonymous, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_home_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const OUTSIDER = "22222222-2222-4222-8222-222222222222";
const PARTNER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let otherHousehold = "";
let otherMember = "";
let assetId = "";
let partnerMember = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'), ('${OUTSIDER}', 'outsider@example.test'), ('${PARTNER}', 'priya@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");

  [otherHousehold, otherMember] = asProfile(
    OUTSIDER,
    `select household_id || ' ' || member_id from wh.create_household('Outsider Home', 'Outsider');`,
    options,
  ).split(" ");

  assetId = asProfile(
    HEAD,
    `insert into public.home_assets (household_id, name, service_interval_days, last_serviced_on, responsible_member_id)
     values ('${household}', 'Geyser', 365, '2026-05-01', '${headMember}')
     returning id;`,
    options,
  );

  psql(`insert into public.profiles (id, display_name) values ('${PARTNER}', 'Priya');`, options);
  partnerMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${PARTNER}', 'adult', 'Priya') returning id;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a household sees its own assets and nobody else's", () => {
  asProfile(
    OUTSIDER,
    `insert into public.home_assets (household_id, name) values ('${otherHousehold}', 'Their washing machine');`,
    options,
  );

  assert.equal(asProfile(HEAD, `select count(*) from public.home_assets;`, options), "1");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.home_assets;`, options), "1");
  assert.equal(
    asProfile(HEAD, `select name from public.home_assets;`, options),
    "Geyser",
    "an asset from another household was visible",
  );
});

test("an outsider cannot write into a household they do not belong to", () => {
  assert.ok(
    deniedForProfile(
      OUTSIDER,
      `insert into public.home_assets (household_id, name) values ('${household}', 'Planted');`,
      options,
    ),
  );
});

test("a signed-out visitor sees none of it", () => {
  assert.ok(deniedForAnonymous(`select * from public.home_assets;`, options));
  assert.ok(deniedForAnonymous(`select * from public.pets;`, options));
  assert.ok(deniedForAnonymous(`select * from public.laundry_needs;`, options));
});

test("an asset cannot be made another household's member's responsibility", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.home_assets (household_id, name, responsible_member_id)
       values ('${household}', 'Air conditioner', '${otherMember}');`,
      options,
    ),
    "a foreign key pointed at another household's member and was accepted",
  );
});

test("a service request cannot be attached to another household's asset", () => {
  const theirs = asProfile(
    OUTSIDER,
    `insert into public.home_assets (household_id, name) values ('${otherHousehold}', 'Their geyser') returning id;`,
    options,
  );

  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.service_requests (household_id, asset_id, subject)
       values ('${household}', '${theirs}', 'Not ours to fix');`,
      options,
    ),
  );
});

test("a settled request may not keep a next action", () => {
  const request = asProfile(
    HEAD,
    `insert into public.service_requests (household_id, asset_id, subject, next_action, next_action_by)
     values ('${household}', '${assetId}', 'Geyser not heating', 'Confirm a slot', 'provider')
     returning id;`,
    options,
  );

  assert.ok(
    deniedForProfile(
      HEAD,
      `update public.service_requests set status = 'completed' where id = '${request}';`,
      options,
    ),
    "a completed request kept a next action, which would go on generating work",
  );

  asProfile(
    HEAD,
    `update public.service_requests
       set status = 'completed', next_action = null, next_action_by = null
     where id = '${request}';`,
    options,
  );

  assert.equal(
    asProfile(HEAD, `select status from public.service_requests where id = '${request}';`, options),
    "completed",
  );
});

test("a laundry state has to say when and how it was established", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.laundry_needs (household_id, label, needed_by, state)
       values ('${household}', 'School uniform', now() + interval '1 day', 'drying');`,
      options,
    ),
    "a state was accepted with no provenance behind it",
  );

  const need = asProfile(
    HEAD,
    `insert into public.laundry_needs (household_id, label, needed_by, state, state_as_of, state_source)
     values ('${household}', 'School uniform', now() + interval '1 day', 'drying', now(), 'device')
     returning id;`,
    options,
  );

  assert.match(need, /^[0-9a-f-]{36}$/);
});

test("an unknown laundry state needs no provenance, because that is the honest default", () => {
  const need = asProfile(
    HEAD,
    `insert into public.laundry_needs (household_id, label, needed_by)
     values ('${household}', 'Bed linen', now() + interval '3 days')
     returning state;`,
    options,
  );

  assert.equal(need, "unknown");
});

test("pet care must be able to fall due at all", () => {
  const pet = asProfile(
    HEAD,
    `insert into public.pets (household_id, name, species) values ('${household}', 'Mishti', 'cat') returning id;`,
    options,
  );

  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.pet_care_needs (household_id, pet_id, kind) values ('${household}', '${pet}', 'food');`,
      options,
    ),
    "a need with neither a rhythm nor a date was accepted",
  );

  const need = asProfile(
    HEAD,
    `insert into public.pet_care_needs (household_id, pet_id, kind, interval_days, last_done_on)
     values ('${household}', '${pet}', 'food', 30, current_date) returning id;`,
    options,
  );
  assert.match(need, /^[0-9a-f-]{36}$/);
});

test("a pet care need cannot be attached to another household's pet", () => {
  const theirPet = asProfile(
    OUTSIDER,
    `insert into public.pets (household_id, name, species) values ('${otherHousehold}', 'Bruno', 'dog') returning id;`,
    options,
  );

  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.pet_care_needs (household_id, pet_id, kind, interval_days)
       values ('${household}', '${theirPet}', 'food', 30);`,
      options,
    ),
  );
});

test("a non-admin member cannot add a pet", () => {
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.pets (household_id, name, species) values ('${household}', 'Whiskers', 'cat');`,
      options,
    ),
  );
});

test("a new pet is active by default, and only an admin can retire or restore one", () => {
  const pet = asProfile(
    HEAD,
    `insert into public.pets (household_id, name, species) values ('${household}', 'Rocky', 'dog') returning id;`,
    options,
  );

  assert.equal(
    psql(`select active from public.pets where id = '${pet}';`, options),
    "t",
    "a pet was not active by default",
  );

  assert.ok(
    deniedForUpdate(
      PARTNER,
      `update public.pets set active = false where id = '${pet}';`,
      `select active from public.pets where id = '${pet}';`,
      "t",
      options,
    ),
    "a non-admin member retired a pet",
  );

  asProfile(HEAD, `update public.pets set active = false where id = '${pet}';`, options);
  assert.equal(
    psql(`select active from public.pets where id = '${pet}';`, options),
    "f",
    "an admin could not retire a pet",
  );

  asProfile(HEAD, `update public.pets set active = true where id = '${pet}';`, options);
  assert.equal(
    psql(`select active from public.pets where id = '${pet}';`, options),
    "t",
    "an admin could not bring a retired pet back",
  );
});

test("a pet's gender is optional, set and changed by an admin, and held to a sensible length", () => {
  const pet = asProfile(
    HEAD,
    `insert into public.pets (household_id, name, species, gender) values ('${household}', 'Luna', 'cat', 'Female (spayed)') returning id;`,
    options,
  );
  assert.equal(psql(`select gender from public.pets where id = '${pet}';`, options), "Female (spayed)");

  const unrecorded = asProfile(HEAD, `insert into public.pets (household_id, name, species) values ('${household}', 'Pip', 'budgie') returning id;`, options);
  assert.equal(psql(`select coalesce(gender, '<null>') from public.pets where id = '${unrecorded}';`, options), "<null>");

  assert.ok(
    deniedForUpdate(
      PARTNER,
      `update public.pets set gender = 'Male' where id = '${pet}';`,
      `select gender from public.pets where id = '${pet}';`,
      "Female (spayed)",
      options,
    ),
    "a non-admin member changed a pet's gender",
  );

  asProfile(HEAD, `update public.pets set gender = null where id = '${pet}';`, options);
  assert.equal(psql(`select coalesce(gender, '<null>') from public.pets where id = '${pet}';`, options), "<null>", "an admin could not clear a pet's gender");

  assert.throws(() => asProfile(HEAD, `update public.pets set gender = '   ' where id = '${pet}';`, options), "a blank gender was stored");
  assert.throws(() => asProfile(HEAD, `update public.pets set gender = repeat('x', 41) where id = '${pet}';`, options), "an over-long gender was stored");
});

test("a member cannot manufacture a device signal", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.home_device_signals (household_id, asset_id, device_key, kind, observed_at, value, confidence)
       values ('${household}', '${assetId}', 'washer', 'cycle_complete', now(), 1, 0.99);`,
      options,
    ),
    "a member wrote their own evidence that something had happened",
  );
});

test("the server can ingest a signal and the household can read it", () => {
  psql(
    `insert into public.home_device_signals (household_id, asset_id, device_key, kind, observed_at, value, confidence)
     values ('${household}', '${assetId}', 'washer', 'cycle_complete', now(), 1, 0.99);`,
    options,
  );

  assert.equal(
    asProfile(HEAD, `select count(*) from public.home_device_signals;`, options),
    "1",
  );
  assert.equal(
    asProfile(OUTSIDER, `select count(*) from public.home_device_signals;`, options),
    "0",
    "another household could read these readings",
  );
});

// Story 17-007: the household's weather area. Choosing what leaves the
// household is an Admin's decision; every member plans around the answer.

test("an Admin can choose the household's weather area, and every member can read it", () => {
  asProfile(
    HEAD,
    `insert into public.weather_locations (household_id, label, latitude, longitude, timezone, set_by_member_id)
     values ('${household}', 'Pune, Maharashtra, India', 18.52, 73.86, 'Asia/Kolkata', '${headMember}');`,
    options,
  );
  assert.equal(asProfile(PARTNER, `select label from public.weather_locations;`, options), "Pune, Maharashtra, India");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.weather_locations;`, options), "0", "another household could read this area");
});

test("the area can never be finer than about a kilometre", () => {
  assert.equal(
    asProfile(HEAD, `update public.weather_locations set latitude = 18.519572 where household_id = '${household}' returning latitude;`, options),
    "18.52",
    "a precise coordinate was stored",
  );
});

test("a member who is not an Admin cannot change or remove the area", () => {
  assert.ok(
    deniedForUpdate(
      PARTNER,
      `update public.weather_locations set label = 'Somewhere else' where household_id = '${household}';`,
      `select label from public.weather_locations where household_id = '${household}';`,
      "Pune, Maharashtra, India",
      options,
    ),
    "a non-Admin changed where the household's weather comes from",
  );
  asProfile(PARTNER, `delete from public.weather_locations where household_id = '${household}';`, options);
  assert.equal(asProfile(HEAD, `select count(*) from public.weather_locations;`, options), "1", "a non-Admin switched weather off");
});

test("an outsider cannot set, change or remove another household's area", () => {
  assert.ok(
    deniedForProfile(
      OUTSIDER,
      `insert into public.weather_locations (household_id, label, latitude, longitude, set_by_member_id)
       values ('${household}', 'Elsewhere', 1, 1, '${otherMember}');`,
      options,
    ),
    "an outsider set another household's weather area",
  );
  assert.ok(
    deniedForUpdate(
      OUTSIDER,
      `update public.weather_locations set label = 'Elsewhere' where household_id = '${household}';`,
      `select label from public.weather_locations where household_id = '${household}';`,
      "Pune, Maharashtra, India",
      options,
    ),
    "an outsider changed another household's weather area",
  );
});

test("an Admin cannot record the choice as somebody else's", () => {
  assert.ok(
    deniedForProfile(
      OUTSIDER,
      `insert into public.weather_locations (household_id, label, latitude, longitude, set_by_member_id)
       values ('${otherHousehold}', 'Mumbai', 19.08, 72.88, '${headMember}');`,
      options,
    ),
    "the area was recorded as set by a member of another household",
  );
});

test("a stored forecast must be a list and say when it was fetched", () => {
  assert.ok(
    deniedForProfile(HEAD, `update public.weather_locations set forecast = '{"rain": 1}'::jsonb, forecast_fetched_at = now() where household_id = '${household}';`, options),
    "a forecast that is not a list was stored",
  );
  assert.ok(
    deniedForProfile(HEAD, `update public.weather_locations set forecast = '[]'::jsonb, forecast_fetched_at = null where household_id = '${household}';`, options),
    "a forecast with no fetch time was stored",
  );
});

test("an Admin can switch weather off", () => {
  asProfile(HEAD, `delete from public.weather_locations where household_id = '${household}';`, options);
  assert.equal(asProfile(HEAD, `select count(*) from public.weather_locations;`, options), "0");
});
