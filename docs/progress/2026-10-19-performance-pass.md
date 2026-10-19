# Performance pass: membership checked once per query, fewer round trips per page

**Date:** 2026-10-19 · **Asked by:** the owner ("run a full review of the app and see where the performance can be optimised… make the application fast and snappier")

## What was measured first

- **The live database** (`pg_stat_statements`, Supabase's performance advisor).
  - Home's setup percentage made 17 count queries per view. The slowest averaged 21 ms (max 251 ms) for about ten rows.
  - `EXPLAIN ANALYZE` as a signed-in member showed why. Counting 32 responsibilities took **17 ms and 982 buffers**, because every row ran `wh.is_household_admin()` and `wh.is_member()`.
  - Both are security-definer functions with a fixed search path, so Postgres cannot inline them. 344 policies used these per-row helpers.
  - The advisor also listed:
    - 4 policies calling `auth.uid()` per row;
    - 176 foreign keys with no index;
    - 51 tables with overlapping permissive policies.
- **The code** (a review of the signed-in request path). Every page waited on:
  - 3–4 sequential session round trips;
  - 2 reminder-throttle writes after it;
  - a plan lookup that was 3 sequential queries.
- **Per page:**
  - Home was 6–7 round trips deep, and could wait on a live weather fetch.
  - HomeTalk was 6 steps deep.
  - Kids & School, Meals and Family read the same tables twice.
  - HomeTalk's conversation actions had no limit.
  - HomeTalk shipped the whole English catalogue to the browser as an unused fallback.

## What changed

**Database (applied live, then `verify:live` 302/302):**
- `20261019120000_rls_set_based_membership.sql`:
  - New helpers `wh.member_households()`, `wh.admin_households()` and `wh.my_memberships()` answer as sets, once per statement.
  - Every policy's expression is rewritten in place (`ALTER POLICY`), and each rewrite is exactly equivalent:
    - `is_member(x)` becomes `x in (select wh.member_households())`;
    - `is_household_admin(x)` becomes `x in (select wh.admin_households())`;
    - `col = member_id(x)` becomes `(x, col) in (select household_id, member_id from wh.my_memberships())`;
    - a bare `auth.uid()` becomes `(select auth.uid())`.
  - Live: 0 per-row helpers left, and 253 policies use the set form.
  - The same count now takes **0.7 ms** (0.6 ms of it the one membership lookup), and touches 14–21 buffers.
- `20261019121000_foreign_key_indexes.sql`: 89 indexes on household, member, child and parent-row foreign keys. The 87 left are audit columns nothing reads by.
- `20261019122000_household_setup_counts.sql`:
  - `public.household_setup_counts(household)` returns the setup percentage's 16 numbers in one call.
  - It is security invoker, so every count still goes through the caller's own RLS.
  - About 8 ms warm, in place of 17 parallel requests.
  - `loadSetupFacts` falls back to per-domain counts where the function is missing.

**Code:**
- **Session** (`_lib/session.ts`):
  - The avatar path comes with the membership read (`listMemberships`).
  - Unread count, first-seen mark, translator and avatar signing run in one wave.
  - The reminder reconcile skips the database when this server instance asked within the 5-minute window (`_lib/reminders.ts`).
- **Plan** (`billing/repository.ts`):
  - `loadSubscription` reads the subscription, all 37 plan features and the running experiments in one parallel wave, then picks the plan in code.
  - `may()` memoises the usage count per request.
  - `runningExperiments` no longer takes a plan key.
- **Home:**
  - The weather reads alongside the domain rows (`home/repository.ts`).
  - The weather area and the plan check are asked together (`home/weather-service.ts`).
  - Each domain read starts alongside its plan check, and is discarded if refused (`_lib/agenda.ts`).
  - The three helper reads start with the first wave.
- **Kids & School, Meals, Family:**
  - `schoolAgenda`, `mealAgenda` and `familyAgenda` return the rows they assessed, so their pages no longer read them a second time.
  - Family's agenda starts alongside its plan check.
- **HomeTalk** (`/ai`):
  - One parallel wave covers the plan, voice settings, members, speech key, Gemini gate, open session and place book.
  - Right after setup, the welcome is still written before the history is read.
  - `listMessages` reads only the newest actions, three times the page size.
- **Calendar:** members and holiday regions start alongside the preferences read. Holiday regions (platform data) are kept per server for an hour.
- **Groceries:** the list reads alongside the plan check.
- **Bundle:** `assistant.tsx` and `home-send-sheet.tsx` no longer import the English catalogue as a fallback; their labels are required and always built on the server. No catalogue key appears in any client chunk.

## Verified

- **A/B on the production build** against the live database. Same database for both, the median of five warm loads at 360px. The container's latency to Mumbai is about 190–480 ms per trip, so this mostly counts sequential round trips:

  | Page | `main` | this branch |
  |---|---|---|
  | Home | 1,977 ms | 889–1,260 ms |
  | HomeTalk | 2,566 ms | 1,080 ms |
  | Family | 1,867 ms | 870 ms |
  | Groceries | 1,829 ms | 870–900 ms |
  | Kids & School* | 1,612 ms | 880 ms |
  | Meals* | 1,596 ms | 840–870 ms |
  | Calendar | 1,378 ms | 1,110–1,140 ms |
  | Manage Household | 1,193 ms | 850–880 ms |

  \*Both runs used a Free-plan household, so these two pages took their "not in this plan" path. On Pro, the full pages took about 1,100–1,150 ms on this branch; `main` was not timed on Pro.
- **In production** (Vercel `bom1`, beside the database), round trips cost a few ms, and database time is what the RLS change cuts.
  - After the change, the per-table counts average 0.03–0.26 ms (they were 11–21 ms).
  - Across all signed-in API statements, the mean is 0.49 ms.
- **Gates:**
  - `test:db` 667/667, including the new `scripts/test-setup-counts-rls.mjs`. It checks member, outsider and anon access to the counts, the helpers' answers, and that no policy still checks row by row.
  - `npm test`: 3549 unit and 64 script tests.
  - Typecheck, lint, and `npm run eval` 128/128 with unsafe actions 0/18.
  - `security` 12/12, `lint:migrations`, `lint:secrets`, `lint:help-links`, `check:bundle`, `tracker --check`, and the production build.
- **Browser** at 360px and 1280px on a QA household: Home, Kids & School, Meals, HomeTalk, Calendar and Family render their content. No horizontal scroll and no page errors.
- **Advisors after the change:**
  - performance: `auth_rls_initplan` 4 → 0, unindexed foreign keys 176 → 87;
  - security: nothing new.

## Still open

- **The voice engines load on every page.** `LiveTalkProvider` in the root layout pulls in `use-gemini-live`, `use-live-voice` and `live-float`. Loading them on first use means restructuring the provider behind cross-screen voice and auto-float, so it was left for its own change.
- **Duplicate reads remain on Meals and Home.**
  - Meals: `recipes` and `consumables` are read twice.
  - Home: a 14-day events read alongside `familyAgenda`'s full future read.
- **Overlapping permissive policies** (51 tables: a `select_member` plus an `ALL` write policy). Each is now cheap, so they were not merged.
- **PostgREST schema reloads.** `SELECT name FROM pg_timezone_names` (335 ms) runs on every schema-cache reload; each migration's `notify pgrst` triggers one. It is not on the request path.
- **For a person: `public.rls_auto_enable()`** is a security-definer function that `anon` and `authenticated` can execute through `/rest/v1/rpc/rls_auto_enable`. It is not in any migration, so it was created outside the repository. Revoke its `EXECUTE` from `anon` and `authenticated` (or drop it) once its purpose is confirmed.

## QA cleanup

Recorded after the merge.
