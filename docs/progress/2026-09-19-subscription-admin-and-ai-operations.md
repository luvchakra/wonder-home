# Subscription administration and AI operations monitoring (16-005, 16-006)

**Date:** 2026-09-19
**Scope:** `packages/core/src/platform/subscriptions.ts`, `packages/core/src/platform/ai-operations.ts`, platform-admin API routes, `billing/repository.ts`
**Status:** Done

## What was built

Module 16's last two P0 stories, both read-through, not new storage.

**16-005 — Subscription administration.** Staff can view and change any
household's plan through `/api/v1/platform-admin/subscriptions/{householdId}`
(GET for the current plan + catalogue + preview, POST to apply). The
mechanics are exactly the household's own plan-change path from 20-004 —
`changePlan`, unmodified — reached through the service-role client because
staff have no membership to read through. `changePlan` gained two optional
fields to make that possible: `actorProfileId` (alongside the existing
`actorMemberId`, since staff acting through the admin surface has no
household membership) and `reasonCode`.

The reason is a **code**, not a note. `redact()` treats any metadata key
matching `/note|content|body|prompt|...*/i` as private content and replaces
it with `[redacted]` before writing to `audit_events` — which would have
silently swallowed a free-text reason while looking like it was recorded.
Caught by reading `redact.ts` rather than by a failing test: `reasonCode`
was chosen specifically because the pattern doesn't match it, and a fixed
set of five codes (`household_requested`, `billing_dispute`,
`plan_correction`, `fraud_review`, `goodwill_adjustment`) is more reviewable
than free text would have been anyway — the same reasoning
`support_access_grants` already used for its own reason codes.

Gated on a new `subscription.manage` capability, held by `operator` and
`owner`, not `support` — moving a household's money is not a support
ticket's job.

**16-006 — AI operations.** `/api/v1/platform-admin/ai-operations` (summary
counts + recent failed runs) and `/ai-operations/runs/{runId}` (one run's
full detail) read `agent_runs`/`agent_tool_calls` — tables migration
`20260917023243` already built to be operator-safe: a run holds a bounded
summary, never a raw prompt, and a tool call holds a name, an outcome and,
for a refusal, a code and a short reason. Nothing new was stored; this is
the platform-side read of what that schema already guarantees cannot hold.
Gated on a new `ai_operations.read` capability, also `operator`/`owner`
only — the migration's own comment says it was shaped to be safe "for an
operator", and this is fleet-wide visibility, not one reason-coded
household, so `support`'s narrower standing doesn't reach it.

Both stories are API + core logic only, no new screen — matching the
existing pattern for every other story in this module (16-001 through
16-004 shipped the same way, no `/platform-admin` UI exists yet). This
module's own surfaces are internal tooling, not part of the household-facing
design system `design/UI-UX-REQUIREMENTS-v3.md` governs.

## What was verified

- `npm run typecheck`, `lint`, `lint:boundaries`, `lint:embeds`,
  `lint:secrets` — clean
- `npm run test` — 1026 unit tests passing (was 1024; +2 new files)
- `npm run security` — 9/9 areas (this module isn't one of the nine named
  areas; the new capability gates are covered by their own unit tests, which
  assert the guard runs *before* any database call, not just that it
  eventually refuses)
- `npm run build` — succeeds; the new routes appear in the route manifest
- `npx playwright test` (both projects) — 126/126 passing, including
  `e2e/domains.spec.ts`'s dynamic route/OpenAPI cross-check, which derives
  its list from the files on disk and would have failed on an undocumented
  or unauthenticated new route without any change needed to the test itself
- OpenAPI document updated (`openapi.ts` + the fixed list in
  `openapi.test.ts`) for all three new paths

## What is still open

- No new migration was needed for either story: `household_subscriptions`'
  service-role write already bypasses the household-admin-only RLS policy
  from 20-004, and `agent_runs`/`agent_tool_calls` already existed. The
  actual *writing* of agent runs and tool calls (the orchestrator recording
  its own activity) is module 14's scope, not 16-006's — this story only
  had to build the operator-facing read of whatever that produces, so an
  otherwise-idle platform correctly returns empty lists and zero counts
  rather than an error.
- Module 16 now has two P1 stories left: 16-007 (privacy requests) and
  16-008 (feature flags/audit) — deferred by the module's own priority
  ordering, not by anything discovered while building these two.

## Where the code lives

- `packages/core/src/platform/subscriptions.ts`,
  `packages/core/src/platform/subscriptions.test.ts`
- `packages/core/src/platform/ai-operations.ts`,
  `packages/core/src/platform/ai-operations.test.ts`
- `packages/core/src/platform/admin.ts` — two new capabilities
  (`subscription.manage`, `ai_operations.read`)
- `packages/core/src/billing/repository.ts` — `changePlan` widened
- `apps/web/app/api/v1/platform-admin/subscriptions/[householdId]/route.ts`
- `apps/web/app/api/v1/platform-admin/ai-operations/route.ts`,
  `apps/web/app/api/v1/platform-admin/ai-operations/runs/[runId]/route.ts`
- `packages/core/src/api/openapi.ts`, `openapi.test.ts`
