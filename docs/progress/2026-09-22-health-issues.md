# Story 21-003: health issues

Health & Fitness's third story: everyday health observations through their
own lifecycle, never a diagnosis. Follows the same self-or-guardian-only
privacy model 21-001 and 21-002 established.

## What was built

- **`supabase/migrations/20260922100000_health_issues.sql`** — `health_issues`:
  person, label (1–160 chars), description (≤2000), notes (≤1000), status
  (`mentioned | active | monitoring | resolved | closed`), `privacy_scope`,
  `source_type`, `provenance_id`, `started_at`, `resolved_at`,
  `created_by_member_id`. A DB CHECK constraint
  (`health_issues_resolved_at_matches_status`) keeps `resolved_at` set if and
  only if the status is `resolved`/`closed` — enforced at the database, not
  just in application code. Same four-policy RLS shape as `health_appointments`:
  select via `wh.may_see_health()`, three separate self-or-guardian-only
  policies for insert/update/delete (never a `for all` policy — that class of
  bug leaks SELECT through the write policy's USING clause, found and fixed
  proactively in earlier health stories, applied here from the start).
- **`packages/core/src/health/issue-safety.ts`** — `assessForMedicalAttention()`,
  a small, fully deterministic, unit-tested list of regexes (chest pain,
  trouble breathing, severe bleeding, high fever, seizure, anaphylaxis,
  poisoning, etc.). Never a model call, never a diagnosis engine — the
  strongest thing it can ever produce is one fixed sentence recommending the
  household consider seeking medical attention. Runs on every create and
  every content edit; its result is surfaced but never blocks the write.
- **`packages/core/src/health/issues.ts`** — repository: `listIssues`,
  `getIssue`, `createIssue`, `updateIssue`, `setIssueStatus`. `createIssue`
  always writes a `health_provenance` row first (`source_type: manual_entry`,
  `confirmed_by`/`confirmed_at` set immediately — a person typing this in has
  already confirmed it) and links it — but that row deliberately carries only
  `source_type`/`confidence`/`confirmed_by`/`confirmed_at`, never the issue's
  own label/description/notes, since `health_provenance` is household-wide
  readable by design (21-001's own decision) and copying health content into
  it would defeat `privacy_scope` entirely. `setIssueStatus` validates the
  transition against a `STATUS_TRANSITIONS` lookup table where every status
  can reach every other status — reopening a resolved issue is exactly as
  valid as resolving an active one (CLAUDE.md rule 12: nothing here is
  one-way).
- **`packages/core/src/health/agenda.ts`** — `healthIssuesAgenda()` groups
  issues into the same three Overview buckets the reader actually thinks in:
  mentioned/active → Needs attention, monitoring → its own Monitoring
  section (previously always empty since 21-001), resolved/closed → Recent.
  Never a flat list.
- **API**: `GET/POST /health/issues`, `GET/PATCH /health/issues/{issueId}`
  (PATCH is a `z.discriminatedUnion` over update-content vs. change-status,
  same pattern as appointments' PATCH route).
- **UI**: `apps/web/app/_components/health-issue-forms.tsx` —
  `AddIssueButton` (who/what/detail/notes/since/privacy-scope form),
  `EditIssueButton` (content-only edit sheet), `IssueStatusActions`
  (icon-button status transitions, the sensible next steps per current
  status rather than all four other statuses at once). `/health`'s Overview
  gained a "Record an issue" entry point beside "Book an appointment", and
  every issue row carries its status-transition buttons plus an edit
  button — so every issue can be added, updated and resolved, never a
  create-only screen (rule 12).
- Audit events (`health.issue_created`, `health.issue_updated`,
  `health.issue_status_changed`) and their `sensitive-actions.ts`
  descriptions; OpenAPI paths with explicit "never a diagnosis" language in
  the POST description.

## A bug found while writing the RLS test, not the product

The RLS test script's raw-SQL `createIssue()` helper (needed so the RLS
suite doesn't depend on the application layer) never populated
`provenance_id` — only the real repository function does that. The
provenance-content-isolation test was therefore asserting against a `null`
id and failing with a UUID-parse error, not a real RLS finding. Fixed by
having that one test insert its own `health_provenance` row directly,
mirroring exactly what `createIssue()` in the app layer does, before
asserting the household administrator can read it (source type only) but
not the private issue it links to.

## Verified

- `npx vitest run src/health` — 5 files, 41 tests, all passed (18 new:
  6 `issue-safety`, 8 `issues` repository via a hand-rolled fake Supabase
  client, plus the earlier 21-001/21-002 suites unaffected).
- `node --test scripts/test-health-issues-rls.mjs` — 9/9: self access,
  admin cannot read or write another adult's private issue,
  `household_operational` visible to any member, guardian can manage a
  child's issue regardless of scope, a non-guardian adult cannot,
  `selected_family` requires the same consent grant `health_profiles` uses,
  the `resolved_at` CHECK constraint rejects a resolved issue with no
  `resolved_at` set, and the provenance-content-isolation case above.
- Full `npm run verify` — typecheck, lint, unit, 9 database/RLS suites,
  build, 312 e2e — all green, including the new OpenAPI-coverage checks for
  the two new routes.
- Migration applied to the live Supabase project (`kqxndableyysxqhxiorz`)
  via `apply_migration`; `npm run verify:live` — 98/98 checks, including two
  new ones (anonymous cannot read or create a `health_issues` row).
- Live browser verification with a real QA household (`qa-test-user.mjs`,
  granted `pro` via direct SQL for `health.tracking`): recorded an issue
  with a concerning description ("Chest pain since this morning") and saw
  the medical-attention recommendation inline in the row; moved it through
  active → monitoring, watched it move from Needs attention into the
  Monitoring section; edited its label; resolved it and watched it land in
  Recent with a "Resolved." note — at 390px and 1280px desktop. QA
  household and auth user removed afterward; dev server stopped.

## What's still open

Checkups & preventive care (21-004), health records/HomeSend intake
(21-005), HomeBrain/HomeTalk health context (21-006), vitals (21-007) and
fitness scaffolding (21-008) remain, per `backlogs/21-Health-and-Fitness.md`.
