# Localized reminders (story 22-006)

## What was done

Every smart reminder is now stored as an event plus its parameters, and each
recipient reads it in their own language.

- **The message.** `notifications.message` holds `{ v, title, body }`. Each part
  is a `reminder.*` catalog key plus typed values: a name or item as written, a
  calendar day, an instant, an amount in its own currency, a list, or a nested
  message. The code is `packages/core/src/notifications/message.ts`, with
  `msg`, `plain`, `renderCopy`, `parseCopy`, `localizeReminder` and `sameCopy`.
- **The record.** `title`/`body` stay English. They are rendered from the same
  message with the English catalog, in the household's region
  (`sources.ts`'s `reminderText`), so the stored English and an English reader
  always agree.
- **Covered:** bills, school items, a child's grouped school day, meals, the
  grocery list, pet care, family plans, and a backup's escalation. The backup's
  line wraps the primary's message.
- **The catalogs.** All seven carry the `reminder.*` wording: en, hi, mr, es,
  fr, de and ar. Arabic has its own plural forms, and lists are joined with
  `Intl.ListFormat` through a new `format.list`.
- **Reading.** `/notifications` renders each row in the viewer's language and
  formats before anything else reads it, so the daily digest and the
  expandable detail follow too. Delivery beyond the app (`deliver.ts`) loads the
  recipient's own locale and sends their language. Anything that cannot be
  rendered falls back to the stored English.
- **Reconcile.** Reconcile compares the stored message ignoring key order,
  because jsonb does not keep it. An up-to-date reminder is therefore never
  rewritten, and a reminder written before this change gains its message on
  the next pass with nothing else changing.
- **Migration.** `20261006090000_notification_messages` adds the column,
  checked to be a versioned object. It also extends the recipient content
  guard, so a member can no more rewrite the message than the title. It was
  applied live, and `verify:live` probes the column.

## Why

Story 22-006, the last P0 story not yet started. Reminders were final English
strings, so a Hindi-speaking parent read "Due in 3 days · ₹2,430.50" in English
inside an otherwise Hindi app.

## Verified

- `message.test.ts`, 12 tests:
  - the English record equals the message read in English;
  - Hindi keeps the bill's name and amount as written;
  - Arabic picks its plural form;
  - Spanish renders the time in the reader's format;
  - French says "Votre enfant" when no child is named;
  - German joins lists its own way;
  - a grouped school day and its escalation render in Hindi;
  - a malformed or non-reminder key is refused;
  - a name that looks like a placeholder is shown as written;
  - key order is ignored.
- Smart notifications, 119 tests. The idempotency tests now include the stored
  message as Postgres returns it, and one checks that a pre-migration row gains
  only its message.
- Notification RLS, 35 tests. A recipient cannot rewrite the message, and the
  column accepts only a versioned object.
- `verify:live` 219/219.
- Browser QA on the real project at 360px and 1280px. The QA member's language
  was set to Hindi, with two bills due. `/notifications` showed "आज देय ·
  ₹2,430.50। 25 सित॰ तक भुगतान करें।" under "BESCOM Electricity", with no
  horizontal overflow. The stored rows kept the English body and
  `reminder.bill.bodyAmount` with `{money: 2430.5, currency: "INR"}`.

## Still open

- Health appointment and measurement reminders, approval requests from an agent
  run, and HomeTalk personal reminders still store English only. Their bodies
  are composed elsewhere (`decision.impact`, the person's own words). Moving
  them onto messages is the same pattern: a key per sentence in every catalog.
- The rest of `/notifications` (tabs, the lede, the closing line) is still
  English. That is story 22-004's catalog coverage, not this story.
- WhatsApp sends through one approved template whose frame language is fixed.
  The parameters now arrive in the recipient's language, but a per-language
  template is a person's errand with Meta once WhatsApp is live.

## Cleanup

QA user `eb5ea655-e930-4855-bfc5-49aa632cbdaa` and household
`d8703d63-8feb-42e5-b1eb-c5bb2df4bcc2` ("Drawer QA Home"). They were created for
the drawer check in #177 and reused here, and are removed after this story's PR
merges. See the follow-up line below.
