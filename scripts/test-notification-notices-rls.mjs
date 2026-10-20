#!/usr/bin/env node
/**
 * The database side of notices, the morning digest and event changes
 * (stories 27-008, 27-013 and the notice source types of 27-004 to 27-014).
 *
 * - A moved or cancelled event is recorded by the database itself, with who
 *   made the change; an edit that changes nobody's plans records nothing.
 * - No session can read the change log: a notice, built per recipient, is what
 *   a person sees.
 * - The notifications table accepts the notice and digest source types, and
 *   nothing outside the list.
 * - A digest is a channel beyond the app, at a minute of the day, and never
 *   the in-app list.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_notification_notices_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";

let household = "";
let headMember = "";
let event = "";

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test');`, options);
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  event = psql(
    `insert into public.family_events (household_id, title, kind, starts_at, ends_at, status, owner_member_id) values ('${household}', 'Diwali party', 'gathering', now() + interval '2 days', now() + interval '2 days 3 hours', 'planned', '${headMember}') returning id;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("moving an event is recorded with who moved it", () => {
  asProfile(HEAD, `update public.family_events set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' where id = '${event}';`, options);
  assert.equal(psql(`select kind || ':' || changed_by_member_id from public.family_event_changes where event_id = '${event}';`, options), `moved:${headMember}`);
});

test("an edit that changes nobody's plans records nothing", () => {
  asProfile(HEAD, `update public.family_events set title = 'Diwali get-together', notes = 'Bring sweets' where id = '${event}';`, options);
  assert.equal(psql(`select count(*) from public.family_event_changes where event_id = '${event}';`, options), "1");
});

test("cancelling is recorded once, and bringing it back records nothing", () => {
  asProfile(HEAD, `update public.family_events set status = 'cancelled' where id = '${event}';`, options);
  asProfile(HEAD, `update public.family_events set status = 'cancelled' where id = '${event}';`, options);
  asProfile(HEAD, `update public.family_events set status = 'planned' where id = '${event}';`, options);
  assert.equal(psql(`select string_agg(kind, ',' order by created_at, kind) from public.family_event_changes where event_id = '${event}';`, options), "moved,cancelled");
});

test("a platform write with no signed-in member is recorded with nobody as the editor", () => {
  psql(`update public.family_events set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where id = '${event}';`, options);
  assert.equal(psql(`select count(*) from public.family_event_changes where event_id = '${event}' and kind = 'moved' and changed_by_member_id is null;`, options), "1");
});

test("no session can read the change log, not even the head of the household", () => {
  assert.equal(asProfile(HEAD, `select count(*) from public.family_event_changes;`, options), "0");
});

test("the notifications table accepts the notice and digest sources, and nothing else", () => {
  for (const source of ["homesend_item", "event_replies", "helper_absence", "grocery_order", "event_change", "weather_plan", "digest"]) {
    psql(
      `insert into public.notifications (household_id, recipient_member_id, type, thread_key, title, body, source_type, source_id) values ('${household}', '${headMember}', 'action', 'k:${source}', 'A title', 'A body', '${source}', gen_random_uuid());`,
      options,
    );
  }
  assert.throws(
    () => psql(`insert into public.notifications (household_id, recipient_member_id, type, thread_key, title, body, source_type, source_id) values ('${household}', '${headMember}', 'action', 'k:other', 'A title', 'A body', 'gossip', gen_random_uuid());`, options),
    /source_type_check/,
  );
});

test("a digest is on a channel beyond the app, at a minute of the day", () => {
  asProfile(HEAD, `insert into public.notification_preferences (household_id, member_id, channel, enabled, digest, digest_minute) values ('${household}', '${headMember}', 'email', true, true, 450);`, options);
  assert.equal(psql(`select digest || ':' || digest_minute from public.notification_preferences where channel = 'email';`, options), "true:450");
  assert.throws(() => asProfile(HEAD, `insert into public.notification_preferences (household_id, member_id, channel, digest) values ('${household}', '${headMember}', 'in_app', true);`, options), /digest_not_in_app/);
  assert.throws(() => asProfile(HEAD, `update public.notification_preferences set digest_minute = 1440 where channel = 'email';`, options), /digest_minute_check/);
});

test("a channel the system paused says why, and only in closed words", () => {
  psql(`update public.notification_preferences set enabled = false, paused_reason = 'address_rejected', paused_at = now() where channel = 'email';`, options);
  assert.equal(psql(`select paused_reason from public.notification_preferences where channel = 'email';`, options), "address_rejected");
  assert.throws(() => psql(`update public.notification_preferences set paused_reason = 'because we said so' where channel = 'email';`, options), /paused_reason_check/);
});
