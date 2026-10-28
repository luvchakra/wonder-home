# Performance pass: service-role singleton, FK indexes, Today agenda (2026-10-28)

Requested: look across the app, optimise performance, fix connection leakage,
improve speed/response time. Findings came from two audits — Supabase's live
performance advisor and a server-side query-hotspot sweep.

## What shipped

### 1. Service-role client is now a singleton (the "connection leakage" fix)
`packages/core/src/db/admin.ts`. `createAdminClient()` built a fresh client on
each of ~100 call sites — several times per request on the hot paths (HomeTalk,
reminders, grocery orders). It carries no per-request state (no cookies, no user
session, `persistSession: false`, no realtime socket), so it is now a lazily-built
process-wide singleton, reused across requests on a warm instance. The
per-request user client (`db/server.ts`) stays request-scoped and was already
memoised with React `cache()`, as were `getVerifiedUser` and `loadSubscription`.

### 2. Index 92 unindexed foreign keys + drop 1 duplicate index
`supabase/migrations/20261028160000_index_foreign_keys.sql`. The advisor found 92
FK columns with no covering index (member/profile/plan/parent references) and one
duplicate index on `order_items`. An unindexed FK forces a sequential scan of the
child table on every parent-row delete (member/household removal, privacy-request
erasure) and on joins/filters by that column — matching this repo's standing rule
to index every FK. All `if not exists`, validated against a fresh DB (187
migrations apply cleanly). **Applied live by hand** (apply_migration times out in
the cloud session; SQL handed to the owner to run in the SQL Editor).

### 3. Today computes the household agenda only on the household tab
`apps/web/app/today/page.tsx`. The 6-domain `householdAgenda` scan was run on all
three Today tabs but is only consumed on the "household" tab. Gated behind
`active === "household"`, so the common mine/family views skip the whole agenda
computation (and its re-reads of events/obligations/school/consumables/meals).

## Checked, already healthy
- No classic sequential-await waterfalls: pages batch independent reads in one
  `Promise.all` throughout.
- `createClient` / `getVerifiedUser` / `loadSubscription` are React-`cache()`d —
  one cookie read, one JWT verification, one entitlement round trip per request.
- The portal-worker reuses one Chromium and closes each context on the next job.

## Open (deferred — needs careful per-caller work + test updates)
Several shared repository readers on growing tables lack a bound and are hit on
hot paths (Home, Today, and every HomeTalk grounding turn):
- `school/repository.ts` `listSchoolItems` — no date floor / limit.
- `finance/repository.ts` `listObligations` — includes terminal rows, no limit.
- `family/repository.ts` `familyAgenda` → `listEvents({from: now})` — no upper bound.
- `meals/repository.ts` `mealAgenda` → `listMeals({from: today})` — no upper bound.
- Home reads `family_events` three times (dashboard, agenda, hero-cat) over
  different ranges.
These don't bite at current data volumes but will as households accumulate
history. Changing the shared readers' defaults risks correctness (the "show the
whole thing" principle), so each needs an explicit near-term window or an optional
bound applied at the hot call sites, with tests. Tracked as a follow-up task.

## Advisory, not acted on
- 86 "unused index" flags — on a pre-launch DB this mostly means not-yet-queried;
  revisit with real query stats post-launch, don't drop now.
- 62 "multiple permissive policies" — each is a `_select_*` + `_write_*` pair
  overlapping on SELECT; consolidating is a dedicated RLS pass, not a quick win.

## Verified
web + core typecheck; `lint:migrations` (187); fresh-DB template build applies the
index migration cleanly; web build green.
