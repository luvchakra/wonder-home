#!/usr/bin/env node
/**
 * Family time and social database tests (module 12).
 *
 * The rules worth proving in the database rather than in a unit test:
 *
 *   1. Protected time always has an owner, so there is a person to ask before
 *      anything moves it.
 *   2. A person answers an invitation for themselves. An administrator may
 *      answer for a child who has no account; nobody else answers for anybody.
 *   3. Free/busy really is free/busy — wh.busy_windows returns times and
 *      nothing about what anybody is doing.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_family_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const ADULT = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let adultMember = "";
let otherHousehold = "";
let event = "";

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
  [otherHousehold] = asProfile(
    OUTSIDER,
    `select household_id || ' ' || member_id from wh.create_household('Outsider Home', 'Outsider');`,
    options,
  ).split(" ");

  psql(`insert into public.profiles (id, display_name) values ('${ADULT}', 'Priya');`, options);
  adultMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${ADULT}', 'adult', 'Priya') returning id;`,
    options,
  );

  event = asProfile(
    HEAD,
    `insert into public.family_events (household_id, title, kind, starts_at, ends_at, owner_member_id, status)
     values ('${household}', 'Sunday lunch', 'family_time', now() + interval '2 days',
             now() + interval '2 days 3 hours', '${headMember}', 'confirmed')
     returning id;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("an event has to end after it starts", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.family_events (household_id, title, starts_at, ends_at)
       values ('${household}', 'Backwards', now() + interval '2 hours', now());`,
      options,
    ),
  );
});

test("protected time always has an owner to ask", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.family_events (household_id, title, starts_at, ends_at, protected)
       values ('${household}', 'Ownerless protected time', now(), now() + interval '1 hour', true);`,
      options,
    ),
    "protected time was created with nobody to ask before moving it",
  );
});

test("anybody in the household may propose an event", () => {
  const proposed = asProfile(
    ADULT,
    `insert into public.family_events (household_id, title, starts_at, ends_at, owner_member_id)
     values ('${household}', 'Park visit', now() + interval '3 days', now() + interval '3 days 2 hours', '${adultMember}')
     returning id;`,
    options,
  );

  assert.match(proposed, /^[0-9a-f-]{36}$/);
});

test("somebody else's commitment is not yours to rewrite", () => {
  // The head owns Sunday lunch. An UPDATE matching no policy affects no rows
  // rather than raising, so the assertion is on the value.
  asProfile(ADULT, `update public.family_events set title = 'Cancelled by me' where id = '${event}';`, options);

  assert.equal(
    psql(`select title from public.family_events where id = '${event}';`, options),
    "Sunday lunch",
    "one member rewrote another's commitment",
  );
});

test("a person answers an invitation for themselves", () => {
  asProfile(
    HEAD,
    `insert into public.event_participants (household_id, event_id, member_id)
     values ('${household}', '${event}', '${adultMember}');`,
    options,
  );

  asProfile(
    ADULT,
    `update public.event_participants set response = 'yes'
     where event_id = '${event}' and member_id = '${adultMember}';`,
    options,
  );

  assert.equal(
    psql(
      `select response from public.event_participants where event_id = '${event}' and member_id = '${adultMember}';`,
      options,
    ),
    "yes",
  );
});

test("nobody answers on somebody else's behalf, except an administrator for a child", () => {
  asProfile(
    HEAD,
    `insert into public.event_participants (household_id, event_id, member_id)
     values ('${household}', '${event}', '${headMember}');`,
    options,
  );

  asProfile(
    ADULT,
    `update public.event_participants set response = 'no'
     where event_id = '${event}' and member_id = '${headMember}';`,
    options,
  );

  assert.equal(
    psql(
      `select response from public.event_participants where event_id = '${event}' and member_id = '${headMember}';`,
      options,
    ),
    "unknown",
    "one member answered for another",
  );

  const child = asProfile(
    HEAD,
    `select wh.create_child_member('${household}', 'Aarav', '2016-04-01'::date, array['${headMember}']::uuid[]);`,
    options,
  );

  asProfile(
    HEAD,
    `insert into public.event_participants (household_id, event_id, member_id, response)
     values ('${household}', '${event}', '${child}', 'yes');`,
    options,
  );

  assert.equal(
    psql(
      `select response from public.event_participants where event_id = '${event}' and member_id = '${child}';`,
      options,
    ),
    "yes",
  );
});

test("free/busy says when, and nothing about what", () => {
  const columns = psql(
    `select string_agg(column_name, ',' order by ordinal_position)
     from information_schema.columns
     where table_schema = 'wh' and table_name = 'busy_windows';`,
    options,
  );

  // Postgres does not always expose function result columns here, so the real
  // assertion is on what the function actually returns.
  const row = asProfile(
    HEAD,
    `select member_id::text || '|' || protected::text
     from wh.busy_windows('${household}', now(), now() + interval '7 days') limit 1;`,
    options,
  );

  assert.match(row, /^[0-9a-f-]{36}\|(true|false)$/, `unexpected shape: ${row} (columns: ${columns})`);

  let leaked = false;
  try {
    asProfile(
      HEAD,
      `select title from wh.busy_windows('${household}', now(), now() + interval '7 days');`,
      options,
    );
    leaked = true;
  } catch {
    leaked = false;
  }
  assert.equal(leaked, false, "free/busy exposed what somebody is doing");
});

test("free/busy stops at the household boundary", () => {
  assert.equal(
    asProfile(OUTSIDER, `select count(*) from wh.busy_windows('${household}', now(), now() + interval '7 days');`, options),
    "0",
    "another household could read this household's availability",
  );
});

test("somebody who declined is not counted as busy", () => {
  asProfile(
    ADULT,
    `update public.event_participants set response = 'no'
     where event_id = '${event}' and member_id = '${adultMember}';`,
    options,
  );

  assert.equal(
    asProfile(
      HEAD,
      `select count(*) from wh.busy_windows('${household}', now(), now() + interval '7 days')
       where member_id = '${adultMember}';`,
      options,
    ),
    "0",
  );
});

test("a member cannot manufacture a conflict", () => {
  // Conflicts are detected by the server. A member who could write one could
  // make WonderHome propose moving somebody else's commitment.
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.schedule_conflicts
         (household_id, left_kind, left_id, left_label, right_kind, right_id, right_label,
          overlap_starts_at, overlap_ends_at, proposed_action)
       values ('${household}', 'event', '${event}', 'Invented', 'meal', '${event}', 'Also invented',
               now(), now() + interval '1 hour', 'move_left');`,
      options,
    ),
  );
});

test("a conflict names both sides and proposes a way out", () => {
  psql(
    `insert into public.schedule_conflicts
       (household_id, left_kind, left_id, left_label, right_kind, right_id, right_label,
        overlap_starts_at, overlap_ends_at, proposed_action, proposed_detail)
     values ('${household}', 'event', '${event}', 'Sunday lunch', 'meal', '${event}', 'Dinner prep',
             now() + interval '2 days', now() + interval '2 days 1 hour', 'ask_household', 'Both matter.');`,
    options,
  );

  assert.equal(psql(`select count(*) from public.schedule_conflicts;`, options), "1");

  // The same clash detected again is one conflict, not a second notification.
  let duplicated = false;
  try {
    psql(
      `insert into public.schedule_conflicts
         (household_id, left_kind, left_id, left_label, right_kind, right_id, right_label,
          overlap_starts_at, overlap_ends_at, proposed_action)
       values ('${household}', 'event', '${event}', 'Sunday lunch', 'meal', '${event}', 'Dinner prep',
               (select overlap_starts_at from public.schedule_conflicts limit 1),
               now() + interval '2 days 1 hour', 'ask_household');`,
      options,
    );
    duplicated = true;
  } catch {
    duplicated = false;
  }
  assert.equal(duplicated, false, "the same clash produced a second conflict row");
});

test("a resolved conflict has to name who resolved it", () => {
  let accepted = false;
  try {
    psql(`update public.schedule_conflicts set status = 'resolved', resolved_at = now();`, options);
    accepted = true;
  } catch {
    accepted = false;
  }
  assert.equal(accepted, false, "a conflict was resolved with nobody's name on the decision");

  asProfile(
    HEAD,
    `update public.schedule_conflicts
       set status = 'resolved', resolved_at = now(), resolved_by_member_id = '${headMember}';`,
    options,
  );
  assert.equal(psql(`select status from public.schedule_conflicts;`, options), "resolved");
});

test("another household sees none of this", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.family_events;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.event_participants;`, options), "0");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.schedule_conflicts;`, options), "0");
});
