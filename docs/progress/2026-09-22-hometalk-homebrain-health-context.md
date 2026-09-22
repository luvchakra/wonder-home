# Story 21-006: HomeBrain & HomeTalk health context

**Date:** 2026-09-22
**Story:** `backlogs/21-Health-and-Fitness.md` — 21-006, HomeBrain & HomeTalk Integration epic

## What was done

Health became a protected context inside the existing HomeBrain — no separate
health brain, no separate AI orchestration path — reachable through HomeTalk's
natural-language commands and the existing specialist/tool/orchestrator
pipeline.

**Permission.** A new `health.manage` permission
(`identity/permissions.ts`) — granted to `head`/`administrator`/`adult` by
default, never `child`/`helper` — is the one gate every health-context read
and write in this story checks, following the exact precedent
`finance.view`/`school.manage` already set.

**HomeTalk.** Five new deterministic rules in `conversation/rules.ts`
recognize the spec's own example utterances and turn them into a
`HouseholdIntent`, placed ahead of the broad preferences rule ("I have X"
would otherwise read as a preference, not a symptom):

- `record_health_appointment` — "I have a dentist appointment next Tuesday
  at 4" resolves a real appointment type from a keyword map
  (`matchAppointmentType`, never invented — falls back to `other`), and a
  missing day or time produces a clarifying question rather than a guessed
  default.
- `log_vital` — "My BP was 128 over 82 this morning" is understood, but
  `executor.ts`'s `canExecute`/`notYetDoable` are honest that no vitals
  table exists yet (story 21-007): the reply says "prepared, and not done,"
  never "on its way."
- `log_health_issue` / `resolve_health_issue` — "I've had a headache since
  yesterday" / "My headache is gone" are real writes through
  `health/issues.ts`'s `createIssue`/`setIssueStatus` (`resolveHealthIssue`
  finds the open issue by a loose label match against the speaker's own
  RLS-scoped list, never a guess across the household).
- `set_fitness_goal` — "I want to walk three times a week" is understood
  (word numbers and digits both parse via a small `countWord` helper), and
  is honest the same way `log_vital` is: no fitness-goal table exists yet
  (story 21-008).
- A health-scoped `ask_status` rule — "What health appointments do I have
  this month?" — required two regex fixes found only by driving the real
  utterance through a live server: the shared `WHEN_WORDS` alternation had
  no "this month"/"next month" branch, and the "what" prefix required
  `'s`/`is`/`s` glued to it, so a bare "What health..." never matched. Both
  are fixed at the shared-constant level, so every other rule that already
  used `WHEN_WORDS` benefits too. `windowFor()` in the conversation route
  also gained a real month-window case, previously silently falling back to
  a one-day window for any `when` it did not recognize.

Every write goes through the same governed domain service the corresponding
screen already calls, through the member's own RLS-scoped client — never a
direct database write from the AI layer.

**`healthAgenda()` joins the specialist pipeline.** New
`health/domain-agenda.ts` gives health the same `(supabase, householdId,
{now}) => { needsAttention, comingUp, monitoring, recent }` shape every
other domain's own agenda already has, built from the existing
`health/agenda.ts` helpers (`healthAppointmentsAgenda`,
`healthIssuesAgenda`, `healthCheckupsAgenda`, `healthRecordsAgenda`) —
`gather-assessments.ts`'s `householdAssessments()` now merges it in exactly
like meals, bills, school and the rest.

**A real specialist, and a real executor.** `ai/specialists.ts` gained
`healthSpecialist`, which only ever proposes `health.notify_overdue` for a
checkup whose status is `at_risk` (overdue) — never a diagnosis, never a
write, only "tell someone." The new `health.notify_overdue` tool
(`ai/tools.ts`, gated by `health.manage`, risk `safe`, reversible) is
executed by `ai/executors.ts`'s new `notifyOverdueHealth()`, which reuses
`health/reminders.ts`'s existing `candidatesFor()` (now exported, since the
appointment-reminder sweep and this notice resolve "who to tell" the same
way) and the existing `notifications/decide.ts` + `notifications/create.ts`
pipeline. This needed a service-role client that `runExecutor()` never had
— its signature grew an optional 4th `admin` parameter, and `ai/run.ts`'s
one call site now passes its own local admin client through. Every other
executor is untouched.

**HomeBrain reads health, but only when authorized, and only what's real.**
`conversation/brain.ts`'s `BrainSnapshot` gained
`healthAppointments`/`healthIssues`/`healthCheckups`, read in `gather()`
only when `permitted("health.manage")` — the exact `finance.view` /
`school.manage` pattern, so a child's own HomeTalk session never even
attempts the read. `factsFrom()` turns them into facts tagged
`contentClass: "health"`, the class the AI privacy gate (15-005) already
knows and which the household's default consent policy excludes by
default — so a question about groceries never surfaces a private health
fact, and a health question only reaches a model once the household has
actually agreed to share that class.

## What was verified

- `npm run typecheck` / `npm run lint` — clean.
- `npm run test` (workspace `@wonderhome/core`) — 1570/1570, including new
  coverage: a dedicated `describe("health (story 21-006)")` block in
  `rules.test.ts` covering all six of the spec's own example utterances
  (plus a false-positive guard so "I have a meeting at 3" is never read as
  a symptom); `executor.test.ts` covers `canExecute`/`notYetDoable` for the
  five new actions and the `zonedTimeToUtcIso` timezone helper by hand
  (2pm Asia/Kolkata → 8:30am UTC); `specialists.test.ts` covers
  `healthSpecialist` proposing for an overdue checkup and staying silent
  for one only due soon; `tools.test.ts` and `brain.test.ts` extended for
  the new tool and the new health facts (including that they never reach
  the default-consent-filtered context).
- Full `npm run verify` — typecheck, lint, unit, 401 database/RLS checks,
  build, 328 e2e — green, twice (before and after the two live-found rule
  fixes above).
- No new migration: this story is conversation-layer plus an
  application-level permission, no schema change — confirmed rather than
  assumed.
- Live browser verification with a real QA household (granted `pro` via
  direct SQL for `health.tracking`, the same QA path 21-005 used, since a
  brand-new household defaults to the `free` plan and this module is
  entitlement-gated). Drove all six of the story's own example utterances
  through the real running app at 390px:
  - "I have a dentist appointment next Tuesday at 4" → real proposal,
    waiting for approval (household default autonomy).
  - "My BP was 128 over 82 this morning" → honestly "prepared, not done."
  - "I've had a headache since yesterday" → real `health_issues` row
    created (confirmed via the conversation API transcript and via SQL).
  - "My headache is gone" → the same issue found and resolved for real
    (`status = 'resolved'`, confirmed via SQL).
  - "I want to walk three times a week" → honestly "prepared, not done."
  - "What health appointments do I have this month?" → this is what
    surfaced the two `WHEN_WORDS`/`what`-prefix regex bugs above; after
    the fix, recognized and answered from the real family calendar
    (this QA household had no configured AI provider, so the reply came
    from the deterministic fallback rather than HomeBrain's model-composed
    answer — both paths were exercised in code, only one had a live model
    to prove against).
  - No AI provider was configured for this QA household, so the
    model-composed HomeBrain answer path (which now includes health facts)
    could not be exercised end-to-end live — verified in code and by the
    `brain.test.ts` fixtures instead.
  - QA household, its subscription row, and its auth user removed
    afterward; dev server stopped.

## What's still open

Vitals (21-007) and fitness/connected-health scaffolding (21-008) are the
two remaining Health & Fitness stories — `log_vital`/`set_fitness_goal`
already understand the request today and will need only their executor
bodies once those domains exist, not a new rule.

## Where the code lives

- `packages/core/src/identity/permissions.ts` — `health.manage`.
- `packages/core/src/conversation/rules.ts` — the five new rules,
  `matchAppointmentType`, `countWord`, the `WHEN_WORDS` fix.
- `packages/core/src/conversation/intent.ts` — the five new
  `IntentAction`s.
- `packages/core/src/conversation/proposal.ts` — permission/action-kind/
  summary/refusal wiring for the five new actions.
- `packages/core/src/conversation/executor.ts` — `recordHealthAppointment`,
  `logHealthIssue`, `resolveHealthIssue`, `zonedTimeToUtcIso`.
- `packages/core/src/health/domain-agenda.ts` — new, `healthAgenda()`.
- `packages/core/src/ai/gather-assessments.ts` — joins it in.
- `packages/core/src/ai/specialists.ts` — `healthSpecialist`.
- `packages/core/src/ai/tools.ts` — `health.notify_overdue`.
- `packages/core/src/ai/executors.ts` — `notifyOverdueHealth`, the
  optional `admin` parameter.
- `packages/core/src/ai/run.ts` — passes its admin client through.
- `packages/core/src/health/reminders.ts` — `candidatesFor` exported.
- `packages/core/src/conversation/brain.ts` — the health reads and facts.
- `apps/web/app/api/v1/households/[householdId]/conversation/route.ts` —
  `health.tracking` feature wiring, `windowFor`'s month case.
