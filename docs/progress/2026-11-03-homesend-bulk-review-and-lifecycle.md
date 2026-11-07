# HomeSend: bulk review, one grouped reminder, 30-day archive, Try again

**Date:** 2026-11-03 · **Story:** 14-059 · **Owner's go:** "go, 30-day auto-archive is okay"

## Why

A survey of `main` found HomeSend reviewed one item at a time, prepared reviews
for only the first 10 waiting items, sent one notification per waiting item
("A … is waiting for your OK", no count, no reason), only looked at items
touched in the last 14 days (so older ones were never reminded and never went
away), and offered no retry on failed items although `retry-queue.ts` existed.

## What changed

1. **Bulk review** (`/home-send`). Tick waiting rows and tap **Add N selected**,
   or with none ticked **Add all I'm sure of**. One button does one job (rule
   14). Only rows that need nothing but a yes get a tick box
   (`homesend/waiting.ts` `bulkReady`). These never qualify: a photo or file, a
   possible duplicate or update of a record, a missing required detail, a
   document plan, extra needs, instructions aimed at WonderHome, or a receipt.
   A bill or health document qualifies only when the Admin's existing "add
   directly" setting already lets it through, because `confirmation.ts` returns
   `govern` otherwise. The server action (`home-send-bulk-actions.ts`) receives
   only ids. For each id it reads the item again, checks it is still waiting,
   prepares the review afresh as this member, and writes only a `bulkReady`
   item. The write goes through `autoApplyHomeSendItem` with the person's own
   decision (`added`), so each item gets the same change row, Undo and
   `homesend.applied` audit as a single confirm. Failures are reported per item
   by name. **Review one by one** opens the next waiting item after each
   confirm or dismiss. Reviews are prepared for every waiting item on the page,
   20 per page, five at a time, with **Show more** for the next page; the hard
   limit of 10 is gone.
2. **Why it waits.** Each row gives the reason in a few words, worked out from
   evidence (`whyItWaits`: confirmation decision, `completeness.ts`,
   `reconcile.ts`), never from a model. Examples: a photo or file, amount not
   clear, possible duplicate of *title*, money waits for you, below your bar.
   After 14 days the row adds "waiting N days — archived at 30".
3. **One grouped reminder.** `homesendNotices` now builds one notice per person
   on thread `homesend:waiting`. Example: "4 things sent to HomeSend are
   waiting · 1 bill, 2 school notices, 1 photo or file. Nothing is added until
   you say yes." Each item counts for its sender when that sender is an adult;
   otherwise it counts for an Admin. The notice is rewritten in place as items
   change and resolves when nothing waits. Once something has waited 14 days on
   the household's calendar, it asks "still want it/them?" and says what
   happens at 30. The sweep now reads every waiting or failed item, up to 500,
   with no 14-day window. It names kinds and counts only. The words are nested
   `reminder.homesend.*` messages, so each reader gets plurals and list
   separators in their own language, in all eight languages. The morning
   digest needs no change: it already includes a person's open notices.
4. **30-day archive.** Migration `20261103120002_homesend_lifecycle.sql`:
   - adds `archived` status, `archived_at`, `archived_from`, `retry_count` and
     `retry_requested_at`, plus consistency checks and two partial indexes;
   - adds `public.archive_stale_home_send_items(p_now, p_limit)`. It is
     service-role only, bounded, idempotent, and writes one audit row per item.
     It archives a waiting or failed item that has been untouched (`updated_at`)
     for 30 days on its household's own timezone calendar.

   The delivery clock (`/api/v1/notifications/dispatch`) runs it in `after()`.
   **Archived (N)** on HomeSend lists these items with **Restore** (the
   archive's Undo), which puts an item back where it was and restarts its 30
   days. Nothing is deleted. Real purge stays in story 15-013, with a note in
   its backlog.
5. **Try again** on a failed link that wouldn't open, a voice note that couldn't
   be heard, or a file that couldn't be read. Never on anything the safety check
   refused, a private link, an unsupported type or a file that was too large.
   The try is counted on the item (five at most, `RETRY_CAP`), rate limited
   (`homesend.retry`, per member and per household), and queued as
   `homesend.reread` on the job queue. The delivery clock runs it through
   `ingest.ts` `rereadFailedItem`: the same `understand` step on the kept
   link, file or words, never a second pipeline. A successful read waits for a
   person like any fresh read. The row shows "trying again", "tried N of 5" or
   "tried 5 times — fill it in by hand or dismiss it".

**Safe in either order.** `SELECT_COLUMNS` is unchanged. The lifecycle columns
are read in a separate query (`listHomeSendLifecycle`) that falls back to
"never archived, never retried" when the columns are missing. Archived rows are
listed only by asking for that status, and `archiveStaleHomeSendItems` treats a
missing function as nothing to do.

## Verified

- `waiting.test.ts` (13). Bulk guards are checked per kind against the real
  `decideConfirmation`; also why-it-waits, the 14/30-day clock on the
  household's calendar, the retry cap and group counting.
- Notices (notices + use-cases): one grouped notice, counts and order,
  recipient routing, stale nudge, and sweep idempotency (rewrite in place,
  resolve).
- i18n catalogs complete in eight languages. Help (106 tests) and help links
  pass.
- `test-homesend-rls.mjs` (66): archive only after 30 days, idempotent,
  audited; members cannot run the archive; the archived-state check; members
  restore and outsiders cannot; retry bounds.
- Unit run over homesend, notifications, security, api, i18n and the HomeSend
  web code: 1,170 passed. Typecheck clean; ESLint clean on the changed files.
  Service-role lint passes (the new action uses
  `adminClientFor(adminGrant.member(...))`). Migration lint and tracker check
  pass.
- `claim.test.ts`: two overlapping bulk requests write an item once. The
  browser check found that two quick taps could race; bulk add now claims
  each item with a compare-and-swap on `updated_at` before writing.
- Browser, production build, on a QA household on the live project. It had 12
  waiting items (six groceries including a repeated "Milk", two bills, a
  school item with no child, an unreadable note, a photo) and a failed link.
  The live project did not have the migration yet, which proves the
  either-order path. Results at 360 px, with no horizontal overflow:
  - six rows could be ticked; "Add all 6 I'm sure of" added them; the repeated
    Milk then read "possible duplicate of Milk" and lost its tick box;
  - each row gave its reason: "money waits for you", "amount not clear",
    "doesn't say who it's for", "not sure what it is";
  - "Review one by one" opened the next item after a dismiss;
  - the failed link showed Try again.

  The notice sweep for that household resolved its 8 old per-item notices and
  created one ("7 things sent to HomeSend are waiting · 2 bills, 2 school
  notices, 1 thing to buy, 1 other thing, 1 that couldn't be read …"). A
  second sweep changed nothing. Notifications showed that single row. The
  1280 px layout was also checked.
- Cleanup ran: the QA household and its rows were deleted (counts 0 for
  households, home_send_items, notifications and members), the QA account
  `ac5b7a0d-…` was deleted, and scratch files and the dev server are gone.
  Nothing was uploaded to Storage.
- No eval cases changed: `confirmation.ts` and auto-add behaviour are
  untouched, and bulk add only reads them.

## Open / needs a person

- The live migration: the Supabase connector refused this session, so the
  owner runs the SQL by hand (see the PR). Until then the screen works as
  before, minus Archived, Try again and the archive.
- Purge of archived items: story 15-013.

## Where

`packages/core/src/homesend/{waiting.ts,repository.ts,retry-queue.ts,ingest.ts}`,
`packages/core/src/notifications/{notices.ts,notices-sweep.ts}`,
`apps/web/app/(auth)/home-send-bulk-actions.ts`, `apps/web/app/_lib/homesend-waiting.ts`,
`apps/web/app/_components/{home-send-inbox.tsx,home-send-archived.tsx}`, `apps/web/app/home-send/page.tsx`,
`supabase/migrations/20261103120002_homesend_lifecycle.sql`.
