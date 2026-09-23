# Story 21-008: fitness & connected-health scaffolding

**Date:** 2026-09-23
**Story:** `backlogs/21-Health-and-Fitness.md` — 21-008, the last story in module 21 (Vitals & Fitness epic)

## What was done

Two new tables, applied live: `health_fitness_goals` (created first, since a
session's `goal_id` points back at it) and `health_fitness_sessions`. Both
use the exact same RLS shape every other health entity in this module
already established — `wh.may_see_health()` for select, three separate
self-or-guardian-only write policies, no household-admin bypass.

**`health_fitness_goals`.** A household member's own consistency-oriented
intention ("walk three times a week"): `activity_type` (a known set plus
`other`+`custom_label`, mirroring `health_vitals`'s own pattern),
`target_count`, `frequency_period` (day/week/month), an optional
`preferred_time`, `status` `active`/`dismissed` — mirroring
`health_measurement_routines`'s lifecycle rather than `health_vitals`'s,
since a goal is a configured, ongoing thing rather than a single logged
fact.

**`health_fitness_sessions`.** A single logged activity: `activity_type`,
`duration_minutes`, an optional paired `distance_value`/`distance_unit`
(a `(distance_value is null) = (distance_unit is null)` constraint, same
discipline `health_vitals.unit` already established — never a default the
schema or app layer invents), `started_at`, `status` `active`/`archived` —
mirroring `health_vitals`'s shape, since a session has no lifecycle beyond a
reversible remove. `goal_id` is nullable and optional: a session can be
logged with no goal behind it, or can name the goal it counts toward,
exactly the way `health_vitals.routine_id` traces a reading back to its
routine.

**The `HealthProvider` abstraction the story actually asks for.** New
`packages/core/src/health/health-provider.ts`: a real, small TypeScript
registry (`HEALTH_PROVIDER_IDS`/`HEALTH_PROVIDERS`) naming seven providers —
`manual`/`home_talk`/`home_send`/`calendar` declared `live: true` (each a
genuinely live path that already exists in this codebase), `apple_health_kit`/
`android_health_connect`/`wearable` declared `live: false`.
`assertHealthProviderLive` is the one function that stands between
"declared" and "claimed live": it throws for the three inert providers
before any write reaches the database. `fitness.ts`'s goal and session
services import only this module — never a provider SDK, since none
exists yet. The `provider_id` column's own CHECK constraint names the full
seven-provider domain (the same discipline `health_vitals.source_type`
established with its own `future_health_integration` placeholder), so a
later real connector needs no schema change, only its own `live: true`.

**No leaderboard, no guilt messaging, no child fitness surveillance —
enforced by placement, not a flag.** `healthFitnessGoalsAgenda`/
`healthFitnessSessionsAgenda` in `agenda.ts` only ever feed the Overview's
"Recent" section, the same place vitals and records live — a goal falling
behind its own configured pace never escalates into "Needs attention",
because the code path that could escalate it was never written. A goal's
row states its own configuration as arithmetic a person can verify ("3
times a week"), never a judgment about whether it is being kept.
`countSessionsInCurrentPeriod` (day/week/month, Monday-start week) is pure
and tested, and nothing calls it to produce a score — it exists for a
future "how am I doing against this" read, not this story's own UI.

**HomeTalk's `set_fitness_goal` now genuinely executes.** Story 21-006
already recognized "I want to walk three times a week" as a
`set_fitness_goal` intent but had nothing to back it — `canExecute`
returned `false` and the reply was honestly "noted, though fitness goals
aren't tracked yet." `executor.ts` gained a real `setFitnessGoal()` through
`createFitnessGoal()` (`providerId: "home_talk"`), and `mapFitnessActivity()`:
a small keyword table maps ordinary phrasing ("go for a run", "play
tennis", "lift weights") onto the known activity set, and keeps the
household's own words as `customLabel` for anything else ("pilates" →
`other`, "Pilates"). `intent.ts`'s own comment, `proposal.ts`'s stale
"no vitals/fitness write exists yet" comment (already inaccurate for
`log_vital`, which 21-007 made real), and `executor.test.ts`'s assertions
were all updated to match — this is the second and last of the two
`ACTION_KIND: "draft"` health actions the module's 21-006 story stubbed
out, and both are real now.

**UI.** `AddFitnessGoalButton`/`GoalActions` and
`LogFitnessSessionButton`/`SessionActions` on `/health`, following the
same sheet-based add/edit/remove/bring-back pattern every other health
entity uses; the session form offers "counts toward" as an optional select
of the member's own active goals.

## What was verified

- `npm run typecheck`, `npm run lint`, `npm run lint:migrations`,
  `npm run lint:boundaries`, `npm run lint:embeds`, `npm run lint:secrets`,
  `npm run security`, `npm run brand -- --check`, `npm run build` — all
  green.
- `npm run test` — 121 test files / all passing, including new
  `fitness.test.ts` (createFitnessGoal/updateFitnessGoal/
  dismissFitnessGoal/reactivateFitnessGoal, createFitnessSession/
  updateFitnessSession/archiveFitnessSession/reactivateFitnessSession,
  the distance value/unit pairing rule, `countSessionsInCurrentPeriod`'s
  day/week/month boundaries) and `health-provider.test.ts`, plus
  `executor.test.ts`/`sensitive-actions.test.ts` extended for the new
  behavior and the eight new audit events.
- New `scripts/test-health-fitness-rls.mjs` (12 tests) proves the RLS
  shape directly against a real Postgres database built from every
  committed migration: self-or-guardian read/write, household-admin
  cannot read or write another adult's private data (not even via
  `WHERE`), `household_operational` visible to any member, `selected_family`
  requires the same consent grant `health_profiles` uses, the
  `target_count`/`duration_minutes` check constraints, the `custom_label`
  requirement, the distance value/unit pairing, `goal_id` linking, and the
  full `provider_id` domain (including that the schema accepts an inert
  provider even though the app layer refuses to write through it).
- Full `npm run test:db` — 381/381 database tests, including the generic
  RLS catalogue checks ("every public table has at least one policy", "no
  table leaks rows across the household boundary") applied automatically
  to both new tables.
- Migration `health_fitness` applied to the live Supabase project
  (`kqxndableyysxqhxiorz`) via the Supabase MCP; confirmed via direct SQL
  introspection (`information_schema.columns` matches the migration
  exactly, both tables have `relrowsecurity = true`, all four policies
  exist per table) and `get_advisors` shows no new security findings.
  `scripts/verify-live-project.mjs` extended with both new tables in
  `SHIPPED_TABLES` and anonymous-cannot-read/write checks for each, for a
  future session to run.

## What's still open

- **`npm run verify:live` itself could not be run in this session.** It
  needs `SUPABASE_SERVICE_ROLE_KEY`, and this sandbox had no
  `apps/web/.env.local` and no service-role key available through any
  channel — the Vercel project's copy is a "sensitive" environment
  variable, which the platform deliberately never returns through its API
  (write-only, by design), and no other source offered it. The live
  verification above was done by hand, directly against the same tables
  and policies the script checks, but the script's own anonymous-client
  assertions (added to it for a future run) were not executed this
  session. A session with real credentials should run `npm run verify:live`
  once to confirm the extended script itself is correct.
- **Live browser QA was not performed**, for the same reason: the app
  fails fast at startup without `SUPABASE_SERVICE_ROLE_KEY`
  (`packages/core/src/config/env.ts`'s `keySchema` requires at least 20
  characters), so the dev/production server could not be started in this
  sandbox at all. Every earlier story in this module was live-verified in
  a real browser at 360px and desktop; this one was not, and that gap is
  real. A session with credentials should sign in as a test household
  (`node scripts/qa-test-user.mjs create`) and drive: add/edit/dismiss/
  reactivate a goal, log/edit/archive/reactivate a session (with and
  without a linked goal, with and without a distance), and the HomeTalk
  utterance "I want to walk three times a week" — then delete the QA
  user.
- Module 21 (Health and Fitness) is now complete — all 8 stories `Done`.

## Where the code lives

- `supabase/migrations/20260923000000_health_fitness.sql` — both new
  tables, applied live.
- `packages/core/src/health/health-provider.ts` — the `HealthProvider`
  registry and `assertHealthProviderLive`.
- `packages/core/src/health/fitness.ts` — `FitnessGoal`/`FitnessSession`,
  the CRUD functions, `countSessionsInCurrentPeriod`.
- `packages/core/src/health/agenda.ts` — `healthFitnessGoalsAgenda`,
  `healthFitnessSessionsAgenda`.
- `packages/core/src/health/domain-agenda.ts` — folds both into
  `healthAgenda()`.
- `packages/core/src/api/openapi.ts` — the four new routes.
- `packages/core/src/api/audit.ts` / `packages/core/src/security/sensitive-actions.ts`
  — the eight new audit events and their coverage/description entries.
- `packages/core/src/conversation/executor.ts` — `setFitnessGoal`,
  `mapFitnessActivity`.
- `packages/core/src/conversation/intent.ts` / `proposal.ts` — comments
  and `describeChanges` updated to match the real behavior.
- `apps/web/app/api/v1/households/[householdId]/health/fitness/goals/`
  and `sessions/` — the API routes.
- `apps/web/app/(auth)/health-fitness-actions.ts` — server actions.
- `apps/web/app/_components/health-fitness-forms.tsx` — the UI.
- `apps/web/app/health/page.tsx` — wired into Overview.
- `scripts/test-health-fitness-rls.mjs` — the RLS test script.
- `scripts/verify-live-project.mjs` — the two new tables and their
  anonymous-access checks, for a future run.
