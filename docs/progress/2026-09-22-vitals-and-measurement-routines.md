# Story 21-007: vitals & measurement routines

**Date:** 2026-09-22
**Story:** `backlogs/21-Health-and-Fitness.md` — 21-007, Vitals & Fitness epic

## What was done

Two new tables, applied live: `health_measurement_routines` (created first,
since a vital's `routine_id` points back at it) and `health_vitals`. Both use
the exact same RLS shape every other health entity in this module already
established — `wh.may_see_health()` for select, three separate self-or-
guardian-only write policies, no household-admin bypass.

**`health_vitals`.** A single reading: `value`/`secondary_value` cover both
a plain number (weight: 72 kg) and a paired one (blood pressure: 128/82,
`value` = systolic, `secondary_value` = diastolic) without a second table.
`unit` is free text — always what the household typed, never a default the
schema or the app layer invents. `status` is `active`/`archived` (never a
hard delete, CLAUDE.md rule 12) — a hard-delete `deleteVital` was the first
draft, caught and replaced before it shipped by re-reading rule 12 against
`records.ts`'s own archive/reactivate precedent.

**`health_measurement_routines`.** A household-configured recurring
commitment ("measure blood pressure every Sunday morning") — the same
`cadence_days`/`next_due_on` shape `health_checkups` already uses, plus
`preferred_time` and `reminder_enabled` for the reminder sweep.
`completeRoutine()` is the one function that both records the real vital
reading and advances `next_due_on` by the routine's own cadence, so a
household never has to do the same thing twice.

**Trend text is arithmetic, never a conclusion.** `summarizeVitalTrend`/
`describeVitalTrend` in `health/vitals.ts` compute count and calendar span
between the oldest and newest reading in a sample and phrase it as "your
last N readings were recorded over the past M weeks" — never a stated
health judgment (CLAUDE.md rule 9, and this story's own explicit acceptance
criterion).

**HomeTalk's `log_vital` now actually executes.** Story 21-006 already
recognized "My BP was 128 over 82 this morning" as a `log_vital` intent but
had nothing to back it — `canExecute` returned `false` and the reply was
honestly "prepared, not done." `executor.ts` gained a real `logVital()`
through `createVital()`, and a conservative `parseVitalReading()`: blood
pressure ("128 over 82" or "128/82"), pulse/heart-rate and steps resolve
without an explicit unit in the utterance since each has one conventional
unit (mmHg, bpm, steps); every other type (weight, height, temperature,
distance, exercise duration, resting heart rate, a custom type like blood
sugar) requires an explicit unit word or the request is declined with a
specific, actionable message — never silently assuming a system of
measurement.

**Reminders stay on the day-scale cron sweep, not the agent pipeline.** A
new `health/routine-reminders.ts` mirrors the existing appointment-reminder
sweep exactly — queries routines due today, reuses `candidatesFor()` and
the existing `notifications/decide.ts` + `notifications/create.ts`
pipeline — folded into `/platform/retention` alongside the appointment and
checkup sweeps. Deliberately not a new agent-specialist tool: a routine's
reminder is a sparse, schedule-driven nudge the household itself
configured, not an agenda item for `coordinate()` to plan around.

**UI.** `AddVitalButton`/`EditVitalButton`/`VitalActions` and
`AddRoutineButton`/`EditRoutineButton`/`CompleteRoutineButton`/
`RoutineActions` on `/health`, following the same sheet-based add/edit/
remove/bring-back pattern every other health entity uses. One real bug
found and fixed while building the routine form: the shared `Switch`
component (`packages/core/src/components/ui/switch.tsx`) is a controlled
Radix wrapper with only `{checked, onCheckedChange, disabled, label,
className}` props — no `name`/`defaultChecked` — so it never appears in
native `FormData` on submit. Fixed by pairing it with a
`<input type="hidden" name="reminderEnabled">` kept in sync via local
state, confirmed live (the reminder toggle's real value reached the
database, not just its default).

## What was verified

- `npm run test` — 1608/1608, including new coverage: `vitals.test.ts`
  (createVital/updateVital/archiveVital/reactivateVital,
  summarizeVitalTrend/describeVitalTrend across single/multi-reading/
  same-day/multi-week samples), `measurement-routines.test.ts`
  (classifyRoutine's overdue/due-soon/silent boundaries,
  createRoutine/updateRoutine/dismissRoutine/reactivateRoutine/
  completeRoutine), and `executor.test.ts`/`rules.test.ts` extended for
  `log_vital`'s new `canExecute` behavior, `parseVitalReading`, and the new
  "log/record my X as Y" rule.
- New `scripts/test-health-vitals-and-routines-rls.mjs` (10 tests) proves
  the RLS shape directly against Postgres: self-or-guardian read/write,
  household-admin cannot read or write another adult's private data (not
  even via `WHERE`), `household_operational` visible to any member,
  `selected_family` requires the same consent grant `health_profiles`
  uses, the `cadence_days`/`custom_label` check constraints, and
  `health_vitals.routine_id` linking correctly.
- Full `npm run verify` — typecheck, lint, security suite (extended: the
  nine new `health.vital_*`/`health.routine_*` audit events registered in
  `sensitive-actions.ts`'s coverage list and `describeAuditEvent`, caught
  by the suite's own "every event must be accounted for" check), 1608
  unit, 411 database/RLS, build, 344 e2e — green.
- Migration `health_vitals_and_routines` applied to the live Supabase
  project (`kqxndableyysxqhxiorz`) via the Supabase MCP.
  `verify-live-project.mjs` extended with both new tables in
  `SHIPPED_TABLES` and anonymous-cannot-read/write checks for each — 111/111
  live checks pass.
- Live browser QA with a real QA household (temporarily granted `pro` via
  direct SQL for `health.tracking`, a fresh household defaults to `free`):
  added a vital and a routine, completed the routine (confirmed the
  reading was recorded and `next_due_on` advanced by the cadence via SQL),
  archived and reactivated a vital, dismissed and brought back a routine,
  and drove three real HomeTalk utterances — "My BP was 128 over 82 this
  morning" and "Log my weight as 71.5 kg" both produced real
  `health_vitals` rows with `source_type = 'home_talk'` (confirmed via
  SQL); "Log my weight as 71.5" (no unit — genuinely ambiguous) was
  correctly declined with an actionable message rather than guessing a
  unit. QA household, its subscription row, and its auth user removed
  afterward; dev server stopped.

Two real gaps were found and fixed during this live QA pass, not left for
a later session:

- **A dismissed routine with no completion history had nowhere to appear
  on the page.** `classifyRoutine` returns `"silent"` for a dismissed
  routine regardless of date, and the Recent list only ever included
  routines with a `lastCompletedOn` — so a routine dismissed before it was
  ever completed had no home anywhere in the Overview, and its "Bring
  back" control was unreachable (CLAUDE.md rule 12). Fixed:
  `healthRoutinesAgenda`'s Recent list now also includes a
  dismissed-but-never-completed routine, and the page renders
  `RoutineActions` for it there. `health_checkups` has the exact same
  latent gap, from an earlier already-merged story (21-004) — left
  unfixed here as out of scope, worth its own follow-up.
- **HomeTalk only recognized "My X was/is Y."** "Log my weight as 71.5
  kg" — an equally natural phrasing, and the first utterance tried in live
  QA — fell through to the generic "I did not follow that" fallback.
  Added a matching `"log/record my X as Y"` rule in `rules.ts`.

## What's still open

- The same "dismissed-with-no-history has nowhere to go" gap in
  `health_checkups`/`healthCheckupsAgenda` (story 21-004) — not touched
  here, flagged for its own fix.
- Story 21-008 (fitness & connected-health scaffolding) is the last story
  in this module.

## Where the code lives

- `supabase/migrations/20260922160000_health_vitals_and_routines.sql` —
  both new tables, applied live.
- `packages/core/src/health/vitals.ts` — `HealthVital`,
  `listVitals`/`getVital`/`createVital`/`updateVital`/`archiveVital`/
  `reactivateVital`, `summarizeVitalTrend`/`describeVitalTrend`.
- `packages/core/src/health/measurement-routines.ts` — `MeasurementRoutine`,
  `classifyRoutine`, the CRUD functions, `completeRoutine`.
- `packages/core/src/health/routine-reminders.ts` — the day-scale sweep.
- `packages/core/src/health/agenda.ts` — `healthVitalsAgenda`,
  `healthRoutinesAgenda` (with the Recent-list dismissed-routine fix).
- `packages/core/src/health/domain-agenda.ts` — folds both into
  `healthAgenda()`.
- `packages/core/src/api/audit.ts` /
  `packages/core/src/security/sensitive-actions.ts` — the nine new audit
  events and their coverage/description entries.
- `packages/core/src/conversation/executor.ts` — `logVital`,
  `parseVitalReading`.
- `packages/core/src/conversation/rules.ts` — the new "log/record my X as
  Y" rule.
- `apps/web/app/api/v1/households/[householdId]/health/vitals/` and
  `measurement-routines/` — the API routes.
- `apps/web/app/(auth)/health-vital-actions.ts` /
  `health-measurement-routine-actions.ts` — server actions.
- `apps/web/app/_components/health-vital-forms.tsx` /
  `health-measurement-routine-forms.tsx` — the UI.
- `apps/web/app/health/page.tsx` — wired into Overview (including the
  Recent-section fix for a dismissed routine's actions).
- `scripts/test-health-vitals-and-routines-rls.mjs` — the RLS test script.
- `scripts/verify-live-project.mjs` — the two new tables and their
  anonymous-access checks.
