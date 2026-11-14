# Nothing waits — part A of "Nothing stuck in review" (14-067)

**Date:** 2026-11-14. **Story:** 14-067. **Design:** `docs/design/2026-11-14-nothing-stuck-in-review.md` (the coordinator's page, in the repo, with part A's build notes).

The owner asked for HomeSend, HomeTalk and HomeBrain to work as one so that "minimum intervention is required to input information in the app" and nothing is "stuck in review", then said "implement". Three sessions build it in parallel; this is part A, "Nothing waits" (decisions 3 and 4). Part B ("Record first") and part C ("HomeBrain knows") add their questions to the same list.

## What was done

- **Every item sent ends as something** (`homesend/deadlines.ts`, pure): not household information it couldn't place is set aside at once (`not_household`); unreadable is read once more another way, then its sender is asked once to resend (default after 24 h: `not_resent`); read but of no known kind is kept as a household note (`kept_as_note`); anything else waiting gets one question. A waiting bill, receipt or health document is left to part B (recorded as Checking, decision 2), never defaulted into a note.
- **Household notes** are the HomeSend items themselves (archived, `kept_as_note`): the words stay on HomeSend's own table (X-003), with source, audit and Restore, never copied into `memories`. HomeTalk reads them through `listHouseholdNotes` in its context.
- **Every question has a default and a deadline** (decision 4): `needs_you_items` (migration `20261114231500_needs_you.sql`), default 24 h after the thing was sent, closed by 48 h. The step `clock.homesend-deadlines` (`hometalk/needs-you-run.ts`; GitHub clock, Vercel fallback) applies due defaults through the same switch a tap uses, audited `needs_you.defaulted`; closes HomeTalk proposals still waiting after 48 h as not done; withdraws questions settled elsewhere. A default never pays, orders, approves, undoes, or confirms money or health.
- **Checking keeps its reminders** (decision 3): marked "not yet confirmed", bills "check before paying" (`notifications/sources.ts` `notYetConfirmed`, `reminder.checking.*` in eight languages). Mark paid and editing a bill, school item, event or health record confirm the entry (`homesend/changes.ts` `confirmByAction`).
- **One "Needs you" list** (`hometalk/needs-you*.ts`, `_components/needs-you*.tsx`, `(auth)/needs-you-actions.ts`): HomeSend questions, HomeTalk proposals and pending approvals, ranked by consequence then age, three shown, tap answers, each saying its default and when. At the top of `/ai` and on Home. Parts B and C add rows with `askNeedsYou` and their effects with `registerNeedsYouHandler`.
- **HomeSend page**: send box, "Added recently" with Undo, "Set aside" (ten newest, reason and Restore). The review sections are gone.
- **One daily summary** replaces the grouped "waiting" and "questions" notices (`homesendSummaryNotices`, `reminder.homesend.summary.*`, `reminder.needsYou.*`).
- **Measures** on the Platform admin Overview ("Nothing waits", `public.platform_nothing_waits`, `homesend/metrics.ts` `parseNothingWaits`): sends that needed a person (count of total, 30 days), open Needs-you items per household with the oldest one's age (anonymous), Checking entries over 7 days without a stated reason (and those kept Checking on purpose), entries undone within 7 days. A "homesend-stuck" item joins the Overview's own list when a question is open past 48 h or an entry is Checking past 7 days without a reason.
- **Reversible**: Settings → AI Assistant → "Remind about entries still Checking" and "Apply a question's default after a day" (`household/nothing-waits-repository.ts`, versioned `policies` rows, Admin only, both on by default).
- CLAUDE.md, `docs/agent-platform.md`, `docs/notifications.md`, `docs/background-jobs.md` updated; help guide (HomeSend body 5, 9, 12, new 16; FAQs on waiting and questions) in eight languages; backlog 14-067; eval HS-55–65.

## Verified

- Typecheck (core and web), ESLint on changed files, `lint:migrations`, `lint:knowledge`, `lint:embeds`, `lint:boundaries`, `lint:boundaries:input`, `lint:service-role`, `lint:secrets`, `lint:help-links`, `check:bundle`, production build.
- Unit tests: 2,214 in the touched core areas and 151 in the web app; new tests for the rules (`deadlines.test.ts`), ranking (`needs-you.test.ts`), the whole step on an in-memory database (`needs-you-run.test.ts`, including the switch off), the daily summary, Checking reminders and the switch (`notices.test.ts`, `unconfirmed-hold.test.ts`), the measures (`nothing-waits-metrics.test.ts`).
- Database: `scripts/test-needs-you-rls.mjs` (7 tests: who sees what, answers in your own name, defaults never edited by hand, closed stays closed, the 48-hour check, one open per thing) on a fresh database from every migration; `test-setup-counts-rls.mjs` (no per-row helpers); the aggregate function executed.
- Evaluation: 269/269 golden cases, Unsafe Action Rate 0/47, every release gate held.
- Browser, 360 px, production build against the live project with a QA household: HomeSend shows the send box, "Added recently" and "Set aside" with Restore, no horizontal scroll; Settings → AI Assistant shows both switches on, and a flip saves and persists. The "Needs you" card could not be seen live because the migration is not applied yet (below).

## Before (live, 14 Nov, real households)

15 waiting items in one household (11 unreadable pasted texts, 4 unknown kind; the coordinator also counted 1 bill held by the money switch), 10 Checking entries 7–30 days old in the same household (4 bills, 4 groceries, 2 purchases). The one-time pass is the first run of `clock.homesend-deadlines` after the migration and deploy: questions are asked from when each thing was sent, so their defaults are due and applied in that run, each audited and undoable or restorable. Expected after: the 4 unknown → household notes; the 11 unreadable → read again once, then set aside within the hour as not household information or not resent; 4 groceries confirmed (kept as read); 4 bills and 2 purchases stay Checking with "check before paying" reminders and their question closed (a stated reason); the held bill waits for part B.

## Open / needs a person

- **The migration is not live.** The Supabase connector refused every call in this session ("You do not have permission"), so `apply_migration` could not run. The owner runs `supabase/migrations/20261114231500_needs_you.sql` in the SQL editor (dashboard → project `wonderhome` → SQL Editor → paste → Run). It is additive and safe in either order: until it runs, the step does nothing, the list is empty, and the older notices still speak.
- After it runs: check the "Needs you" card at 360 px and desktop, and report the after counts.
- Parts B and C: register their sources' handlers and words.

## Cleanup

QA user and its two households, the seeded items and the policy rows are deleted after the merge; see the PR thread.
