#!/usr/bin/env node
/**
 * Family Calendar foundation (story 12-009, design/FAMILY-CALENDAR-PHASE0.md §3.2).
 *
 * An event is as visible as its `visibility` says: the household, the owner
 * and the people invited, or the owner alone — and an Admin does not bypass
 * "private". Who is invited, an event's link, its guests and its exceptions
 * are only as visible as the event. Only the owner narrows an event. A repeat
 * rule is a validated subset. Holidays are read-only to every session.
 * Calendar preferences are one member's own. Family events are on every plan.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_calendar_test";
const options = { database: DB };

const OWNER = "11111111-1111-4111-8111-111111111111"; // Admin who created the household
const ASHA = "22222222-2222-4222-8222-222222222222"; // adult
const RAVI = "33333333-3333-4333-8333-333333333333"; // adult
const OUTSIDER = "44444444-4444-4444-8444-444444444444";

let household = "";
let ownerMember = "";
let ashaMember = "";
let raviMember = "";
let privateEvent = "";
let invitedEvent = "";
let sharedEvent = "";
let weekly = "";

const later = (days, hours = 0) => `now() + interval '${days} days ${hours} hours'`;

function event({ title, owner, visibility = "household", recurrence = null, days = 2 }) {
  const rule = recurrence ? `'${JSON.stringify(recurrence)}'::jsonb` : "null";
  return psql(
    `insert into public.family_events (household_id, title, starts_at, ends_at, owner_member_id, visibility, recurrence)
     values ('${household}', '${title}', ${later(days)}, ${later(days, 2)}, ${owner ? `'${owner}'` : "null"}, '${visibility}', ${rule}) returning id;`,
    options,
  );
}

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${OWNER}', 'owner@example.test'), ('${ASHA}', 'asha@example.test'), ('${RAVI}', 'ravi@example.test'), ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );
  [household, ownerMember] = asProfile(OWNER, `select household_id || ' ' || member_id from wh.create_household('Sharma Home', 'Kunal');`, options).split(" ");
  asProfile(OUTSIDER, `select wh.create_household('Other Home', 'Olu');`, options);
  psql(`insert into public.profiles (id, display_name) values ('${ASHA}', 'Asha'), ('${RAVI}', 'Ravi');`, options);
  ashaMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ASHA}', 'adult', 'Asha') returning id;`, options);
  raviMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${RAVI}', 'adult', 'Ravi') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${ashaMember}', 'adult'), ('${household}', '${raviMember}', 'adult');`, options);

  sharedEvent = event({ title: "Sunday lunch", owner: ashaMember });
  privateEvent = event({ title: "Surprise planning", owner: ashaMember, visibility: "private" });
  invitedEvent = event({ title: "Asha and Ravi dinner", owner: ashaMember, visibility: "participants" });
  psql(`insert into public.event_participants (household_id, event_id, member_id) values ('${household}', '${invitedEvent}', '${raviMember}'), ('${household}', '${privateEvent}', '${ashaMember}');`, options);
  psql(`insert into public.event_invite_links (household_id, event_id, token, created_by_member_id) values ('${household}', '${privateEvent}', 'Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDEF', '${ashaMember}');`, options);
  psql(`insert into public.event_guests (household_id, event_id, name, response) values ('${household}', '${privateEvent}', 'Neha', 'yes');`, options);
  weekly = event({ title: "Swimming", owner: ashaMember, recurrence: { freq: "weekly", byWeekday: [6], count: 10 } });
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

const sees = (profile, id) => asProfile(profile, `select count(*) from public.family_events where id = '${id}';`, options) === "1";

test("a household event is seen by every member and by nobody outside", () => {
  assert.ok(sees(OWNER, sharedEvent));
  assert.ok(sees(RAVI, sharedEvent));
  assert.ok(!sees(OUTSIDER, sharedEvent));
});

test("a private event is seen by its owner alone; an Admin does not bypass it", () => {
  assert.ok(sees(ASHA, privateEvent));
  assert.ok(!sees(RAVI, privateEvent));
  assert.ok(!sees(OWNER, privateEvent), "the Admin must not see another member's private event");
});

test("an event for the people invited is seen by its owner and the invited, not the rest", () => {
  assert.ok(sees(ASHA, invitedEvent));
  assert.ok(sees(RAVI, invitedEvent));
  assert.ok(!sees(OWNER, invitedEvent));
});

test("who is invited, the link and the guests are only as visible as the event", () => {
  for (const table of ["event_participants", "event_invite_links", "event_guests"]) {
    assert.equal(asProfile(RAVI, `select count(*) from public.${table} where event_id = '${privateEvent}';`, options), "0", table);
    assert.equal(asProfile(ASHA, `select count(*) from public.${table} where event_id = '${privateEvent}';`, options), "1", table);
  }
  assert.equal(asProfile(OWNER, `select count(*) from public.event_participants where event_id = '${invitedEvent}';`, options), "0");
});

test("only the owner narrows an event; nobody hides something in someone else's name", () => {
  assert.ok(
    deniedForProfile(RAVI, `insert into public.family_events (household_id, title, starts_at, ends_at, owner_member_id, visibility) values ('${household}', 'Not mine', ${later(4)}, ${later(4, 1)}, '${ashaMember}', 'private');`, options),
  );
  assert.ok(
    deniedForProfile(RAVI, `insert into public.family_events (household_id, title, starts_at, ends_at, visibility) values ('${household}', 'Nobody''s', ${later(4)}, ${later(4, 1)}, 'private');`, options),
    "a narrowed event with no owner is refused",
  );
  asProfile(RAVI, `insert into public.family_events (household_id, title, starts_at, ends_at, owner_member_id, visibility) values ('${household}', 'Ravi''s own', ${later(4)}, ${later(4, 1)}, '${raviMember}', 'private');`, options);
  assert.equal(asProfile(RAVI, `select count(*) from public.family_events where title = 'Ravi''s own';`, options), "1");

  // The Admin may edit Asha's household event but not make it private.
  assert.ok(deniedForProfile(OWNER, `update public.family_events set visibility = 'private' where id = '${sharedEvent}';`, options));
  asProfile(OWNER, `update public.family_events set title = 'Sunday family lunch' where id = '${sharedEvent}';`, options);
  assert.equal(psql(`select title from public.family_events where id = '${sharedEvent}';`, options), "Sunday family lunch");
});

test("an Admin cannot change or delete a private event they cannot see", () => {
  asProfile(OWNER, `update public.family_events set title = 'Changed' where id = '${privateEvent}';`, options);
  asProfile(OWNER, `delete from public.family_events where id = '${privateEvent}';`, options);
  assert.equal(psql(`select title from public.family_events where id = '${privateEvent}';`, options), "Surprise planning");
});

test("a repeat rule is the validated subset", () => {
  const bad = [{}, { freq: "hourly" }, { freq: "weekly", interval: 0 }, { freq: "daily", byWeekday: [1] }, { freq: "weekly", until: "2027-01-01", count: 3 }, { freq: "weekly", byWeekday: [7] }, { freq: "monthly", extra: 1 }];
  for (const rule of bad) {
    assert.ok(
      deniedForProfile(ASHA, `insert into public.family_events (household_id, title, starts_at, ends_at, owner_member_id, recurrence) values ('${household}', 'Bad', ${later(5)}, ${later(5, 1)}, '${ashaMember}', '${JSON.stringify(rule)}'::jsonb);`, options),
      JSON.stringify(rule),
    );
  }
  asProfile(ASHA, `insert into public.family_events (household_id, title, starts_at, ends_at, owner_member_id, recurrence) values ('${household}', 'Good', ${later(5)}, ${later(5, 1)}, '${ashaMember}', '{"freq":"monthly","interval":2,"until":"2027-06-30"}'::jsonb);`, options);
});

test("an occurrence is changed by whoever may edit the series, and seen with it", () => {
  asProfile(ASHA, `insert into public.event_exceptions (household_id, event_id, occurrence_date, cancelled) values ('${household}', '${weekly}', current_date + 7, true);`, options);
  assert.equal(asProfile(RAVI, `select count(*) from public.event_exceptions where event_id = '${weekly}';`, options), "1");
  assert.ok(deniedForProfile(RAVI, `insert into public.event_exceptions (household_id, event_id, occurrence_date, cancelled) values ('${household}', '${weekly}', current_date + 14, true);`, options));
  assert.ok(
    deniedForProfile(ASHA, `insert into public.event_exceptions (household_id, event_id, occurrence_date, cancelled) values ('${household}', '${sharedEvent}', current_date + 2, true);`, options),
    "an event that does not repeat has no occurrences to change",
  );
});

test("holidays are read by every session and written by none", () => {
  assert.ok(Number(asProfile(RAVI, `select count(*) from public.public_holidays where region = 'IN';`, options)) >= 28);
  assert.ok(deniedForProfile(OWNER, `insert into public.public_holidays (region, on_date, name, source, source_version) values ('IN', '2026-12-31', 'Made up', 'nobody', 'x');`, options));
  assert.ok(deniedForProfile(OWNER, `delete from public.public_holidays;`, options));
  assert.ok(deniedForProfile(OWNER, `update public.public_holidays set name = 'Changed';`, options));
  assert.ok(Number(psql(`select count(*) from public.public_holidays;`, options)) >= 28);
  assert.equal(psql(`select count(*) from public.public_holidays where source is null or length(source) = 0;`, options), "0");
});

test("calendar preferences are one member's own", () => {
  asProfile(ASHA, `insert into public.calendar_preferences (member_id, household_id, default_view) values ('${ashaMember}', '${household}', 'week');`, options);
  assert.equal(asProfile(RAVI, `select count(*) from public.calendar_preferences;`, options), "0");
  assert.equal(asProfile(OWNER, `select count(*) from public.calendar_preferences;`, options), "0");
  assert.ok(deniedForProfile(RAVI, `insert into public.calendar_preferences (member_id, household_id) values ('${ashaMember}', '${household}');`, options));
});

test("family events are on every plan", () => {
  assert.equal(psql(`select count(*) from public.plans p where not exists (select 1 from public.plan_features f where f.plan_key = p.key and f.feature_key = 'family.events' and f.enabled);`, options), "0");
});
