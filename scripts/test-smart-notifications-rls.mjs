#!/usr/bin/env node
/**
 * Smart notification safety tests (module 23, stories 23-001 to 23-005).
 *
 * A recipient controls their own reminder's state — seen, done, dismissed,
 * snoozed forward — and never its content, source or timing window. Every
 * change of state leaves a closed-word trail they cannot forge. A person's
 * reminder timing is theirs; the reconcile throttle is the server's alone.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_smart_notifications_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let partnerMember = "";
let outsiderHousehold = "";

function remind(memberId, { threadKey = `bill:${crypto.randomUUID()}`, status = "delivered", scheduledFor = "now() - interval '1 minute'" } = {}) {
  return psql(
    `insert into public.notifications
       (household_id, recipient_member_id, type, thread_key, title, body, status, category, source_type, source_id,
        reminder_policy, reminder_seq, scheduled_for, expires_at)
     values ('${household}', '${memberId}', 'action', '${threadKey}', 'Electricity bill', 'Due in 3 days', '${status}',
             'bills', 'obligation', gen_random_uuid(), 'bills.three_days_and_due', 1, ${scheduledFor}, now() + interval '4 days')
     returning id;`,
    options,
  );
}

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'), ('${PARTNER}', 'priya@example.test'), ('${OUTSIDER}', 'olu@example.test');`,
    options,
  );
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`, options).split(" ");
  outsiderHousehold = asProfile(OUTSIDER, `select household_id from wh.create_household('Other Home', 'Olu');`, options);

  psql(`insert into public.profiles (id, display_name) values ('${PARTNER}', 'Priya');`, options);
  partnerMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${PARTNER}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${partnerMember}', 'adult');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a recipient marks their reminder seen, and the trail records it", () => {
  const id = remind(partnerMember);
  asProfile(PARTNER, `update public.notifications set status = 'seen', seen_at = now() where id = '${id}';`, options);
  assert.equal(psql(`select status from public.notifications where id = '${id}';`, options), "seen");
  assert.equal(psql(`select count(*) from public.notification_events where notification_id = '${id}' and event_type = 'seen';`, options), "1");
});

test("a recipient dismisses their reminder, and the trail records it", () => {
  const id = remind(partnerMember);
  asProfile(PARTNER, `update public.notifications set status = 'dismissed', dismissed_at = now() where id = '${id}';`, options);
  assert.equal(psql(`select status from public.notifications where id = '${id}';`, options), "dismissed");
  assert.equal(psql(`select count(*) from public.notification_events where notification_id = '${id}' and event_type = 'dismissed';`, options), "1");
});

test("a recipient snoozes forward, once per snooze, and it waits again", () => {
  const id = remind(partnerMember);
  asProfile(
    PARTNER,
    `update public.notifications set status = 'generated', scheduled_for = now() + interval '1 hour', snooze_count = 1 where id = '${id}';`,
    options,
  );
  assert.equal(psql(`select status || ' ' || snooze_count from public.notifications where id = '${id}';`, options), "generated 1");
  assert.equal(psql(`select count(*) from public.notification_events where notification_id = '${id}' and event_type = 'snoozed';`, options), "1");
});

test("a snooze cannot go backwards, beyond a month, or skip being counted", () => {
  const id = remind(partnerMember);
  for (const [sql, what] of [
    [`update public.notifications set status = 'generated', scheduled_for = now() - interval '1 hour', snooze_count = 1 where id = '${id}';`, "into the past"],
    [`update public.notifications set status = 'generated', scheduled_for = now() + interval '40 days', snooze_count = 1 where id = '${id}';`, "beyond a month"],
    [`update public.notifications set status = 'generated', scheduled_for = now() + interval '1 hour' where id = '${id}';`, "without counting"],
    [`update public.notifications set status = 'seen', scheduled_for = now() + interval '1 hour', snooze_count = 1 where id = '${id}';`, "while claiming to have seen it"],
  ]) {
    assert.ok(deniedForProfile(PARTNER, sql, options), `a snooze ${what} was accepted`);
  }
});

test("a recipient never rewrites what a reminder says or what it is about", () => {
  const id = remind(partnerMember);
  for (const [column, value] of [
    ["title", "'Nothing to see here'"],
    ["body", "'Ignore this'"],
    ["priority", "'low'"],
    ["category", "'system'"],
    ["source_id", "gen_random_uuid()"],
    ["source_type", "'meal'"],
    ["reminder_seq", "5"],
    ["expires_at", "now() + interval '1 year'"],
    ["thread_key", "'bill:forged'"],
    ["recipient_member_id", `'${headMember}'`],
  ]) {
    assert.ok(
      deniedForProfile(PARTNER, `update public.notifications set ${column} = ${value} where id = '${id}';`, options),
      `a recipient changed ${column}`,
    );
  }
  assert.equal(psql(`select title from public.notifications where id = '${id}';`, options), "Electricity bill");
});

test("a recipient cannot claim delivery or restore an expired reminder", () => {
  const id = remind(partnerMember);
  assert.ok(deniedForProfile(PARTNER, `update public.notifications set status = 'expired' where id = '${id}';`, options), "a recipient expired a reminder");
  const waiting = remind(partnerMember, { status: "generated" });
  assert.ok(deniedForProfile(PARTNER, `update public.notifications set status = 'delivered' where id = '${waiting}';`, options), "a recipient marked delivery");
  assert.ok(deniedForProfile(PARTNER, `update public.notifications set delivered_at = now() where id = '${waiting}';`, options), "a recipient stamped delivery");
});

test("nobody else in the household touches another person's reminder — not even the Admin", () => {
  const id = remind(partnerMember);
  asProfile(HEAD, `update public.notifications set status = 'dismissed' where id = '${id}';`, options);
  assert.equal(psql(`select status from public.notifications where id = '${id}';`, options), "delivered");
});

test("the server still moves a reminder on: escalation and expiry are recorded", () => {
  const id = remind(partnerMember);
  psql(`update public.notifications set reminder_seq = 2, status = 'generated', body = 'Due today' where id = '${id}';`, options);
  psql(`update public.notifications set status = 'expired' where id = '${id}';`, options);
  assert.equal(
    psql(`select string_agg(event_type, ',' order by created_at, event_type) from public.notification_events where notification_id = '${id}' and event_type in ('escalated', 'expired');`, options),
    "escalated,expired",
  );
});

test("the transition trail cannot be written by a member", () => {
  const id = remind(partnerMember);
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.notification_events (household_id, notification_id, event_type, channel) values ('${household}', '${id}', 'acted', 'in_app');`,
      options,
    ),
    "a member forged a notification event",
  );
});

test("a reminder names a source, a category and a window from closed lists", () => {
  for (const [sql, what] of [
    [`insert into public.notifications (household_id, recipient_member_id, type, thread_key, title, body, category) values ('${household}', '${partnerMember}', 'action', 'x:1', 't', 'b', 'gossip');`, "an unknown category"],
    [`insert into public.notifications (household_id, recipient_member_id, type, thread_key, title, body, source_type, source_id) values ('${household}', '${partnerMember}', 'action', 'x:2', 't', 'b', 'anything', gen_random_uuid());`, "an unknown source"],
    [`insert into public.notifications (household_id, recipient_member_id, type, thread_key, title, body, source_type) values ('${household}', '${partnerMember}', 'action', 'x:3', 't', 'b', 'obligation');`, "a bill reminder with no bill"],
    [`insert into public.notifications (household_id, recipient_member_id, type, thread_key, title, body, earliest_at, latest_at) values ('${household}', '${partnerMember}', 'action', 'x:4', 't', 'b', now(), now() - interval '1 hour');`, "a window that ends before it starts"],
    [`insert into public.notifications (household_id, recipient_member_id, type, thread_key, title, body, reminder_seq) values ('${household}', '${partnerMember}', 'action', 'x:5', 't', 'b', 11);`, "a reminder past the maximum count"],
  ]) {
    assert.throws(() => psql(sql, options), `${what} was stored`);
  }
  // A grocery list and a person's own reminder have no single row behind them.
  psql(
    `insert into public.notifications (household_id, recipient_member_id, type, thread_key, title, body, source_type) values ('${household}', '${partnerMember}', 'action', 'grocery_list:2026-09-24', 'Grocery list needs attention', 'Milk is running low.', 'grocery_list');`,
    options,
  );
});

test("one open reminder per person per thread, so a repeated pass never duplicates", () => {
  remind(partnerMember, { threadKey: "bill:dedupe" });
  assert.throws(() => remind(partnerMember, { threadKey: "bill:dedupe" }), "a second open reminder for the same thread was created");
});

test("a person sets only their own reminder timing; an Admin can read it", () => {
  asProfile(PARTNER, `insert into public.reminder_preferences (household_id, member_id, category, preset) values ('${household}', '${partnerMember}', 'bills', 'due_day');`, options);
  assert.equal(asProfile(HEAD, `select preset from public.reminder_preferences where member_id = '${partnerMember}';`, options), "due_day");
  assert.ok(
    deniedForProfile(HEAD, `insert into public.reminder_preferences (household_id, member_id, category, preset) values ('${household}', '${partnerMember}', 'meals', 'prep_start');`, options),
    "an Admin set another person's reminder timing",
  );
  assert.equal(
    psql(`select count(*) from public.reminder_preferences where member_id = '${partnerMember}' and category = 'meals';`, options),
    "0",
  );
});

test("another household sees none of this", () => {
  const id = remind(partnerMember);
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.notifications where id = '${id}';`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.reminder_preferences where household_id = '${household}';`, options), "0");
  assert.ok(outsiderHousehold);
});

test("the reconcile throttle is the server's alone", () => {
  psql(`insert into public.notification_reconciliations (household_id) values ('${household}') on conflict do nothing;`, options);
  assert.equal(asProfile(HEAD, `select count(*) from public.notification_reconciliations;`, options), "0");
  assert.ok(
    deniedForProfile(HEAD, `insert into public.notification_reconciliations (household_id) values ('${outsiderHousehold}');`, options),
    "a member wrote the reconcile throttle",
  );
});

test("quiet hours are stored to the minute, and only as real minutes", () => {
  asProfile(
    PARTNER,
    `insert into public.notification_preferences (household_id, member_id, channel, quiet_from, quiet_from_minute, quiet_until, quiet_until_minute)
     values ('${household}', '${partnerMember}', 'in_app', 22, 30, 7, 0);`,
    options,
  );
  assert.equal(psql(`select quiet_from || ':' || quiet_from_minute from public.notification_preferences where member_id = '${partnerMember}';`, options), "22:30");
  assert.ok(
    deniedForProfile(PARTNER, `update public.notification_preferences set quiet_from_minute = 75 where member_id = '${partnerMember}';`, options),
    "a quiet-hours minute of 75 was stored",
  );
});

test("a child's school day is one reminder, sourced to the child and naming its items", () => {
  const child = psql(
    `insert into public.household_members (household_id, member_type, display_name) values ('${household}', 'child', 'Aarav') returning id;`,
    options,
  );
  psql(
    `insert into public.notifications (household_id, recipient_member_id, type, thread_key, title, body, category, source_type, source_id, decision_factors)
     values ('${household}', '${partnerMember}', 'action', 'school_day:${child}:2026-09-25', 'Aarav — 2 things for tomorrow', 'Science project and Maths worksheet.',
             'school', 'school_day', '${child}', jsonb_build_object('items', jsonb_build_array(gen_random_uuid(), gen_random_uuid())));`,
    options,
  );
  assert.throws(
    () => psql(`insert into public.notifications (household_id, recipient_member_id, type, thread_key, title, body, source_type) values ('${household}', '${partnerMember}', 'action', 'school_day:x', 't', 'b', 'school_day');`, options),
    "a school day with no child behind it was stored",
  );
});

test("the day's summary and learned timing are each person's own choice, and learning starts off", () => {
  // The partner's in-app row exists from the quiet-hours test; its new choices start as the migration says.
  assert.equal(psql(`select daily_digest || ' ' || learn_timing from public.notification_preferences where member_id = '${partnerMember}' and channel = 'in_app';`, options), "true false");
  asProfile(PARTNER, `update public.notification_preferences set learn_timing = true, daily_digest = false where member_id = '${partnerMember}' and channel = 'in_app';`, options);
  assert.equal(psql(`select daily_digest || ' ' || learn_timing from public.notification_preferences where member_id = '${partnerMember}' and channel = 'in_app';`, options), "false true");
  assert.ok(
    deniedForUpdate(
      HEAD,
      `update public.notification_preferences set learn_timing = false where member_id = '${partnerMember}' and channel = 'in_app';`,
      `select learn_timing::text from public.notification_preferences where member_id = '${partnerMember}' and channel = 'in_app';`,
      "true",
      options,
    ),
    "an Admin changed another person's learned-timing choice",
  );
});
