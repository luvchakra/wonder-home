# Email connector (story 17-003)

**Date:** 2026-09-19 · **Kind:** story · **Module:** 17 External Integrations

## What was done

An email connector scoped deliberately to what the schema already has an
honest home for: `obligations.source` documents "imported from mail" as a
first-class origin, with `integration_id`/`external_id` reserved for exactly
this. Mail the adapter does not recognise as a bill is filed as skipped, not
invented into a domain the product has no canonical model for yet.

The rule the module exists to enforce: **an email can never mark a bill
paid.** `ImportedObligation` has no status field at all — a fresh import
always lands as `received`, and a re-sync's update touches only content
columns (amount, payee, due date, kind, recurrence), never `status`. A bill
a person already marked paid stays paid even if a corrected copy of the same
email arrives later. New and updated rows are always flagged
`requires_review`, since an auto-extracted amount is exactly the kind of
thing a household should check once before trusting it.

Reconciliation is insert/update/unchanged only — no cancel step, unlike the
calendar connector. A calendar's provider can genuinely withdraw an event; an
inbox only ever grows, so a bill's absence from today's sync says nothing
about yesterday's mail.

`POST /households/{id}/integrations/email/sync` runs it for an
administrator and answers with counts and health, never message content.
No provider is live, so it answers 409. The Bills screen shows a health
notice when a connected mailbox is unhealthy, mirroring the calendar
connector's notice on Family.

`toConnectorError` moved from the calendar module to the shared
`integrations/connector.ts`, since a second domain connector needed it and
domain modules should not depend on each other for something provider-generic.

## Verified

- 20 unit tests (`email-connector.test.ts`), finance repository extended and
  covered by existing suite.
- Typecheck, lint, 697 unit tests, production build.
- Full Playwright suite: 168 passed (up from 164 — the new route is
  discovered automatically by the endpoint E2E suite and gets its own
  anonymous-401 and OpenAPI-contract checks).
- No migration needed: `obligations` already carried every column this
  story required.

## Still open

- No live mail provider. Going live needs credentials, a consent flow, a
  real adapter registered under `email:<provider>`, and integration tests.
- Sync is on demand only; scheduling through the job queue is future work,
  same as the calendar connector.
- No UI yet to connect a mailbox itself (the Integrations screen shows
  connection health once one exists, but there is no "Connect" flow for any
  provider — consistent with no provider being live for any domain today).

## Where

`packages/core/src/finance/email-connector.ts`, `email-sync.ts`,
`finance/repository.ts` (`listImportedObligations`, `applyObligationSyncPlan`),
`integrations/connector.ts` (`toConnectorError`), the route under
`apps/web/app/api/v1/.../integrations/email/sync/`, `apps/web/app/bills/page.tsx`.
