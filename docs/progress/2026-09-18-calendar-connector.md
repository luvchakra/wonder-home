# Calendar connector (story 17-002)

**Date:** 2026-09-18 · **Kind:** story · **Module:** 17 External Integrations

## What was done

A calendar connector in the shape of the school connector: one canonical
payload every adapter must produce, translated into `family_events` that
carry the provider's identity so a re-sync reconciles instead of duplicating.

Rules, each a test:

- An imported event is never `protected` — that is a person's decision.
- An imported event is never `confirmed` — a provider says it exists, a
  person confirms it. Provider "tentative" becomes `proposed`.
- A private entry arrives as "Busy" with no title and no location.
- Reconciliation is by provider id and content hash: same hash, no write;
  new hash, update in place; vanished, **cancelled never deleted**, and only
  when the sync was complete. A partial sync cancels nothing.
- A failed sync changes the connection's health and nothing else.
- Identity is stated, never inferred: the new `integration_identities` table
  maps a provider's identifier to a household member, written by an
  administrator. Records from unmapped calendars wait, unmatched.

`POST /households/{id}/integrations/calendar/sync` runs it for an
administrator and answers with counts and health, never a payload. No
provider is live, so the registry has no calendar connector and the endpoint
answers 409.

The family screen shows a health notice when a connected calendar is stale.

## Verified

- 34 unit tests across `calendar-connector.test.ts` and
  `calendar-sync.test.ts` (in-memory ports, fixture connector).
- OpenAPI ⇄ routes contract; the endpoint E2E suite (98 tests) including
  anonymous 401 before body parsing.
- Migration `20260918041000_integration_identities` applied and present on
  the live project (`verify:live` 60/60).

## Still open

- No live calendar provider. Going live needs credentials, a consent flow,
  a real adapter registered under `calendar:<provider>`, and integration
  tests — see `CLAUDE.md` "External providers".
- A UI for administrators to map identities does not exist yet; the
  repository function `mapIdentity` is ready for it.
- Sync is on demand. Scheduling it through the job queue is future work.

## Where

`packages/core/src/family/calendar-connector.ts`, `calendar-sync.ts`,
`family/repository.ts` (`listImportedEvents`, `applyCalendarPlan`),
`integrations/repository.ts` (`loadConnection`, `listIdentities`,
`mapIdentity`), the route under `apps/web/app/api/v1/.../calendar/sync/`.
