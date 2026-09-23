#!/usr/bin/env node
/**
 * Notification privacy and lifecycle tests (stories 06-003, 06-006, 06-007).
 *
 * A notification is addressed to one person. That it is unreadable by the rest
 * of the household — including administrators — is a privacy property, not an
 * incidental one, so it is asserted rather than assumed.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_notifications_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";

let household = "";
let headMember = "";
let partnerMember = "";

function notify(memberId, { threadKey = "outcome:laundry.ready", status = "generated" } = {}) {
  return psql(
    `insert into public.notifications
       (household_id, recipient_member_id, type, thread_key, title, body, status)
     values ('${household}', '${memberId}', 'action', '${threadKey}',
             'Laundry is at risk', 'It will not be ready for the week unless something changes', '${status}')
     returning id;`,
    options,
  );
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
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a member reads their own notifications", () => {
  const id = notify(partnerMember);
  assert.equal(
    asProfile(PARTNER, `select id from public.notifications where id = '${id}';`, options),
    id,
  );
});

test("even the Head of Family cannot read another member's notifications", () => {
  // Seeing what WonderHome told your partner is a privacy problem, not an
  // administrative convenience.
  assert.equal(
    asProfile(
      HEAD,
      `select count(*) from public.notifications where recipient_member_id = '${partnerMember}';`,
      options,
    ),
    "0",
  );
});

test("the lifecycle of someone else's notification is hidden too", () => {
  const id = notify(partnerMember, { threadKey: "outcome:dinner.served" });
  psql(
    `insert into public.notification_events (household_id, notification_id, event_type)
     values ('${household}', '${id}', 'delivered');`,
    options,
  );

  assert.equal(
    asProfile(HEAD, `select count(*) from public.notification_events;`, options),
    "0",
  );
});

test("one open notification per thread per person, so a problem cannot storm", () => {
  const key = "outcome:bills.electricity";
  notify(headMember, { threadKey: key });

  let rejected = false;
  try {
    notify(headMember, { threadKey: key });
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "a second open notification was created for the same situation");
});

test("the same thread may reach two different people", () => {
  const key = "outcome:groceries.stocked";
  assert.ok(notify(headMember, { threadKey: key }));
  assert.ok(notify(partnerMember, { threadKey: key }));
});

test("a resolved notification frees the thread for the next occurrence", () => {
  const key = "outcome:laundry.weekly";
  const first = notify(headMember, { threadKey: key });
  psql(
    `update public.notifications set status = 'resolved', resolved_at = now() where id = '${first}';`,
    options,
  );

  assert.ok(notify(headMember, { threadKey: key }), "the next occurrence could not be raised");
});

test("a recipient can mark their own notification seen", () => {
  const id = notify(partnerMember, { threadKey: "outcome:pets.fed" });
  asProfile(
    PARTNER,
    `update public.notifications set status = 'seen', seen_at = now() where id = '${id}';`,
    options,
  );

  assert.equal(psql(`select status from public.notifications where id = '${id}';`, options), "seen");
});

test("nobody can mark someone else's notification seen", () => {
  const id = notify(partnerMember, { threadKey: "outcome:school.run" });
  asProfile(
    HEAD,
    `update public.notifications set status = 'seen' where id = '${id}';`,
    options,
  );

  assert.equal(
    psql(`select status from public.notifications where id = '${id}';`, options),
    "generated",
    "another member changed the state of a notification addressed to someone else",
  );
});

test("nobody can manufacture an interruption from a browser", () => {
  let rejected = false;
  try {
    asProfile(
      PARTNER,
      `insert into public.notifications
         (household_id, recipient_member_id, type, thread_key, title, body)
       values ('${household}', '${headMember}', 'risk', 'fake', 'Urgent', 'Made up');`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "a client created a notification");
});

test("a notification cannot be addressed outside the household", () => {
  psql(
    `insert into auth.users (id, email) values ('33333333-3333-4333-8333-333333333333', 'o@example.test');
     insert into public.profiles (id, display_name) values ('33333333-3333-4333-8333-333333333333', 'Outsider');
     insert into public.households (name) values ('Other Home');`,
    options,
  );
  const otherMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     select id, '33333333-3333-4333-8333-333333333333', 'adult', 'Outsider'
     from public.households where name = 'Other Home' returning id;`,
    options,
  );

  let rejected = false;
  try {
    notify(otherMember, { threadKey: "outcome:cross.household" });
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "a notification was addressed to another household's member");
});

test("a member manages their own quiet hours", () => {
  asProfile(
    PARTNER,
    `insert into public.notification_preferences (household_id, member_id, channel, quiet_from, quiet_until)
     values ('${household}', '${partnerMember}', 'push', 22, 7);`,
    options,
  );

  assert.equal(
    asProfile(
      PARTNER,
      `select quiet_from from public.notification_preferences where member_id = '${partnerMember}';`,
      options,
    ),
    "22",
  );
});

test("a member cannot set someone else's quiet hours", () => {
  let rejected = false;
  try {
    asProfile(
      PARTNER,
      `insert into public.notification_preferences (household_id, member_id, channel)
       values ('${household}', '${headMember}', 'email');`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "a member changed another member's notification preferences");
});

test("a member sets their own WhatsApp number (story 06-008)", () => {
  asProfile(
    PARTNER,
    `insert into public.notification_preferences (household_id, member_id, channel, target)
     values ('${household}', '${partnerMember}', 'whatsapp', '+15551234567');`,
    options,
  );

  assert.equal(
    asProfile(
      PARTNER,
      `select target from public.notification_preferences where member_id = '${partnerMember}' and channel = 'whatsapp';`,
      options,
    ),
    "+15551234567",
  );
});

test("a target that is not a real phone number is refused for WhatsApp", () => {
  let rejected = false;
  try {
    asProfile(
      PARTNER,
      `insert into public.notification_preferences (household_id, member_id, channel, target)
       values ('${household}', '${partnerMember}', 'whatsapp', 'not-a-number');`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "a malformed WhatsApp target was accepted");
});

test("a push target is free text — it is an opaque subscription reference, not a phone number", () => {
  // "a member manages their own quiet hours" above already created this
  // member's push row — upsert rather than insert, or this collides with it.
  asProfile(
    PARTNER,
    `insert into public.notification_preferences (household_id, member_id, channel, target)
     values ('${household}', '${partnerMember}', 'push', 'endpoint:abc123')
     on conflict (member_id, channel) do update set target = excluded.target;`,
    options,
  );

  assert.equal(
    asProfile(
      PARTNER,
      `select target from public.notification_preferences where member_id = '${partnerMember}' and channel = 'push';`,
      options,
    ),
    "endpoint:abc123",
  );
});

// Story 17-006: a notification sent beyond the app, and its delivery report.

test("a WhatsApp send and its report are server-written events a member cannot forge", () => {
  const id = notify(headMember, { threadKey: "outcome:whatsapp.delivery" });
  psql(
    `insert into public.notification_events (household_id, notification_id, event_type, channel, metadata)
     values ('${household}', '${id}', 'sent', 'whatsapp', '{"providerMessageId": "wamid.TEST"}'),
            ('${household}', '${id}', 'delivery_failed', 'whatsapp', '{"providerMessageId": "wamid.TEST", "code": 131047}');`,
    options,
  );
  assert.equal(
    psql(`select count(*) from public.notification_events where metadata ->> 'providerMessageId' = 'wamid.TEST';`, options),
    "2",
  );
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.notification_events (household_id, notification_id, event_type, channel)
       values ('${household}', '${id}', 'sent', 'whatsapp');`,
      options,
    ),
    "a member recorded a delivery of their own",
  );
});

test("an event word outside the lifecycle is refused", () => {
  const id = notify(headMember, { threadKey: "outcome:whatsapp.words" });
  assert.throws(() =>
    psql(`insert into public.notification_events (household_id, notification_id, event_type) values ('${household}', '${id}', 'bounced');`, options),
  );
});
