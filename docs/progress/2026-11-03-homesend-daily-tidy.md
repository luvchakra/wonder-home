# HomeSend daily tidy: archive what no longer applies

**Date:** 2026-11-03 · **Story:** 14-063 · **Owner's go:** "on daily basis check items pending for review and remove the items which don't make sense anymore, based on due date or other info, use ai to decide" and "in the end run the job once to clear HomeSend".

## What changed

- **The job** (`packages/core/src/homesend/tidy-run.ts`). Once a day per household, from 04:00 on its own calendar, run by the delivery clock (`/api/v1/notifications/dispatch`, after the response, 5 households a tick). It claims the day first with one `homesend_tidy_runs` row per household per local day, so it never runs twice. It looks at items waiting for review, failed items, and the source items of entries added as Checking whose questions ended with no answer and are still unconfirmed. Reads are bounded: 300 items per household, 40 record checks, 10 items to the model.
- **Rules first** (`homesend/tidy.ts`, pure):
  - the item's day has passed, with one grace day, on the household's calendar;
  - it is already on record (a `reconcile.ts` duplicate; an update, cancellation or conflict still waits for a person);
  - a newer item from the same sender, of the same kind, with the same title has replaced it;
  - it failed and is still unreadable after the retry cap of 5.

  Bills, receipts and health documents are archived only when their day has passed AND they are already on record. They are never archived on a date alone and never on a model's word.
- **The model only where the rules can't decide.** This is a waiting item with no date WonderHome could read, at least 2 days old, with words to go on. The call (`tidy-model.ts`) goes through `ai/provider-clients.ts` (new `tidy` timeout) under the household's key and data-use policy, with member names taken out. It returns a structured verdict `{stale, reason ∈ past_date|superseded|cancelled, cited fields, date, newer}`. `checkVerdict` decides whether the verdict counts, using `homebrain/validate.ts`:
  - every cited field must have been shown (`unknown_fact`);
  - a claimed date must be written in the cited fields, never only in "sent" (`unsupported_date`). The year must match, and the date must really be past;
  - a "newer" item must be one the model was shown;
  - "cancelled" needs the item's own words to say it, and nothing on record to cancel.

  A verdict that is unchecked or unsure keeps the item. No text from the model reaches a person.
- **Never deleted.** The item is archived with a new `archive_reason` and stays restorable from HomeSend → Archived. The Archived list now shows the reason on each row. Each archive is a compare-and-swap on `updated_at`, so anything a person touched since the read stays. Each one is audited as `homesend.auto_archived` with the reason, rule or AI, and which evidence fields were used (catalogued in `security/sensitive-actions.ts`).
- **One summary line.** The grouped HomeSend notice gets "Tidied 3 items that no longer apply (2 past events, 1 duplicate) · Restore …". When nothing else waits, the line is its own notice on the same thread and opens Archived. It appears only on days the tidy archived something. The words are `reminder.homesend.tidy.*` in eight languages.
- **Setting.** Settings → AI Assistant → "Tidy up items that no longer apply" (`#homesend-tidy`). It is on by default and only an Admin can change it. It is stored as a policy in `household/homesend-tidy-repository.ts` and registered in the Settings search with keywords in eight languages. If the setting can't be read, the tidy does nothing that day.
- **Help.** The HomeSend section has a new paragraph (body.11), the "What happens to things that wait" FAQ answer is extended, and keywords were added, all in eight languages.
- **Migration** `20261103210000_homesend_daily_tidy.sql`:
  - adds `archive_reason`, with a check and a backfill of `untouched_30_days`, plus a trigger that clears it whenever the item leaves `archived`, so Restore needed no change;
  - allows `archived_from = 'routed'`, and lets an item archived from routed keep `routed_table`;
  - the 30-day sweep now records its reason;
  - adds the `homesend_tidy_runs` table (RLS: Admins read only their own household's rows; members can't write; the primary key covers the foreign key; plus a `run_on` index).

  It is safe in either order: the job checks that the column and table exist first, the reminder's read of the runs is empty without them, and nothing else selects the new column.
- **On-demand run:** `POST /api/v1/platform/homesend-tidy` (Bearer `CRON_SECRET`, `adminGrant.worker`) runs every due household at any hour and reports counts only. It is in the OpenAPI document.

## Verified

- Unit tests:
  - `tidy.test.ts` (23): past archived; future and grace day kept; documents; duplicate vs update; superseded; unreadable at the cap; money/health only when past AND recorded; Checking entries; what goes to the model; the verdict check (wrong date, unknown field, citing only "sent", wrong year, not past, unknown newer item, cancelled vs on record, money).
  - `tidy-run.test.ts` (7): archives and audits with reason and rule/AI; runs once a day; waits for 04:00 local; switch off does nothing; a past bill nobody recorded is kept; an AI verdict with a wrong date is rejected; restore works.
  - `notices.test.ts` (+4): the summary line, the line on its own, nothing when nothing was tidied, routing to an Admin.
- `test-homesend-rls.mjs` (+3): the reason is recorded and cleared by Restore; a routed item round-trips; the runs table is Admin-read only. This runs in CI's DB job.
- Eval HS-39–47 (deterministic): 9/9; the full deterministic run is 224/224 with Unsafe Action Rate 0/26 and every gate passing. HS-42–44 pin a recorded bad verdict (wrong date, injected words, a past unrecorded bill) and expect the item kept on any provider. No live-provider run: this container has no provider key.
- Typecheck (core and web), ESLint on the changed web files, migration lint, service-role lint, boundaries, secrets, security areas, help links, i18n completeness, settings registry, OpenAPI and CSRF tests, and a production build all pass.

## Live

- The migration was applied by hand by the owner after two `apply_migration` approvals timed out. Verified live: the column, the trigger and the runs table.
- The first run happened on the delivery clock's 15:45 UTC tick (21:15 IST). It covered the 3 households holding all 38 waiting or failed items; this session's `CRON_SECRET` is not production's, so the on-demand route was not used. Results, counts only:
  - archived 14: past date 9 (7 by rule, 2 by a checked AI verdict), already on record 4 (rule), superseded 1 (rule); unreadable 0, cancelled 0;
  - kept 24, of which 9 were asked of the model;
  - one health document was archived, by the "past AND already on record" rule; no bill or receipt was archived, and AI archived no money or health item;
  - 14 `homesend.auto_archived` audit rows; the grouped HomeSend reminder carries the "Tidied …" line.
- No QA accounts, households or Storage files were created, so there was nothing to clean up.

## Open / needs a person

- The CodeQL alert on `ai/key-alerts.ts` (the existing API-key fingerprint, a false positive explained on #513) is for the owner to dismiss.
- A targeted live-provider eval of HS-41, HS-45 and HS-47 (`npm run eval -- --cases HS-41,HS-45,HS-47 --provider configured`) needs a provider key in the environment.
- Purge of archived items stays in story 15-013.

## Where

`packages/core/src/homesend/{tidy.ts,tidy-model.ts,tidy-run.ts,archive-reasons.ts}`, `packages/core/src/notifications/{notices.ts,notices-sweep.ts}`, `packages/core/src/household/homesend-tidy-repository.ts`, `apps/web/app/api/v1/platform/homesend-tidy/route.ts`, `apps/web/app/_components/{homesend-tidy-switch.tsx,home-send-archived.tsx}`, `apps/web/app/settings/ai/page.tsx`, `supabase/migrations/20261103210000_homesend_daily_tidy.sql`.
