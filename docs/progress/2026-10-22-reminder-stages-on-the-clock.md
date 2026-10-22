# Reminder stages move on with the clock; one reminder per occasion (27-016, 27-017)

## What the review found
The owner asked how notifications work and what needs fixing. Most of it was
healthy:
- The pg_cron delivery clock ran every 5 minutes, and every call returned 200.
- The daily sweep ran at 03:02 UTC.
- No delivery failed in 30 days, and no retry job was stuck.
- Push and email were configured and had sent.

Two real faults showed up in the owner's own household on 22 Oct:

1. **A stage waited for a page load (27-016).** The "this morning" reminder
   for the Bounce trip was due at 01:30 UTC (7:00 IST). It was made at 01:55,
   when someone opened the app. The five-minute clock only delivered reminders
   that already existed. A sequence's next stage ("tonight", then "this
   morning") was made only by a page load or by the daily sweep at 8:30 IST,
   which is after a 7:00 reminder is any use.
2. **Two reminders for one occasion (27-017).** "Asmi — School event" (the
   school notice's "Field trip to Bounce") and "Bounce School Trip" (the
   family event) were both scheduled for that morning.

## What changed
- **`advanceDueStages`** (`notifications/reconcile.ts`), called first on every
  dispatch tick (`/api/v1/notifications/dispatch`):
  - Each household with a reminder still open (generated, delivered or seen,
    and not expired) takes the same reconcile a page load gives it. Only those
    households can have a next stage.
  - It runs under the same five-minute claim, so a page load and the clock
    never both run it.
  - The longest-waiting households go first, at most 40 a tick.
  - The tick's response now reports `advanced`.
- **`sameOccasionAsEvent`** (`notifications/sources.ts`): a school entry that
  is the same occasion as a family event that day sends no reminder of its own.
  It uses the HomeEvents matcher (`sameTitledOnDay`), so a different name for
  the same occasion still counts. The calendar event, HomeEvents' record,
  carries the reminder. This covers pairs already on record behind 26-018's
  one door.
- **CLAUDE.md** describes the clock's stage pass.

## Verified
- `stages.test.ts` (8 tests) covers:
  - the Bounce pair, including an entry with no time;
  - another day, another title, a cancelled event;
  - the order, the per-tick bound and the failed read.

  All 267 notification tests pass.
- The new open-reminder read (`.or(expires_at…)`) ran against the live
  project: it found 4 open reminders across 2 households.
- Typecheck, lint and `npm run eval` are clean.

## Still open
Recorded in the review, not built here:
- **The priority of "event today" reminders.** They are `low`, so they never
  earn a push or an email. That is the owner's call.
- **A prompt to turn on push.** Only one device is registered.
- **WhatsApp (27-011).** It needs a Meta business account.
- **Two possibly stale households** (`bc5c99ff…`, `1a662d62…`), for the owner
  to confirm.
- **Cost at scale.** Each tick reconciles up to 40 households one after
  another. With many households, a stored "next stage at" time would let the
  clock reconcile only the ones that are due.
