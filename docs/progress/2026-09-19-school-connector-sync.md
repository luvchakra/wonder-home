# School connector: wired to a real sync (story 17-004)

**Date:** 2026-09-19 · **Kind:** story · **Module:** 17 External Integrations

## What was done

Module 08 already had the school connector's contract, fixture and
`translate()` — everything 17-004 asked for except the part that actually
runs a sync end to end, which is what this story adds, in the same shape as
the calendar and email connectors built earlier today.

`translate()`'s output gained two fields, additively (nothing existing
callers relied on changed): `contentHash`, carried through so a re-sync can
tell "unchanged" from "corrected" by provider identity plus hash, exactly
like calendar and email; and `providerCancelled`, which finally reads the
`SchoolPayload.status` field that existed on the payload type but was
silently dropped on the floor — a real gap, now closed.

Reconciliation (`planSchoolItemsSync`) inserts, updates, or leaves unchanged
by identity and content hash. A provider's own cancellation is honoured —
withdrawn work should not go on haunting a family's plan — but the rule is
symmetric with the connector's oldest promise ("a portal cannot report work
done"): it also can never un-report a child's own completion, so cancelling
is refused whenever the existing item is already `done` or `submitted`.

Identity mapping reuses the same `integration_identities` table and
`listIdentities`/`IdentityMapping` the calendar connector introduced in
17-002, adapted to school's own `ChildMapping` field names at the one
boundary that needs to know both — rather than a second, parallel mapping
mechanism for the same underlying fact.

`POST /households/{id}/integrations/school/sync` runs it for an
administrator; counts and health only, never a child's work; 409 while no
provider is live. The School screen now shows a health notice when a
connected portal is unhealthy, using `describeSchoolHealth` from module 08
which existed but was never wired into the UI.

## Verified

- 27 new/changed unit tests across `connector.test.ts` (contentHash,
  providerCancelled) and the new `school-sync.test.ts`.
- Typecheck, lint, 709 unit tests, production build.
- Full Playwright suite: 172 passed (up from 168 — the new route is
  discovered automatically and gets its own anonymous-401 and OpenAPI checks).
- No migration needed: `school_items` already carried every column this
  story required.

## Still open

- No live school provider, per `CLAUDE.md` — same as calendar and email.
- Sync is on demand only; scheduling through the job queue is future work.
- No UI to map a provider's child identifiers to household members yet
  (`mapIdentity` in `integrations/repository.ts` is ready for it, same gap
  noted for the calendar connector).

## Where

`packages/core/src/school/connector.ts` (`TranslatedSchoolItem`),
`school-sync.ts`, `sync-ports.ts`, `repository.ts`
(`listImportedSchoolItems`, `applySchoolItemsSyncPlan`), the route under
`apps/web/app/api/v1/.../integrations/school/sync/`,
`apps/web/app/school/page.tsx`.
