# 2026-10-26 — A generic school-portal connector catalog (08-028)

## What was done
The owner asked for a *generic* connector so WonderHome can read a child's
assignments, exams and academic details from **any** school portal, not one
school in particular.

The connector framework already existed and is well-shaped (stories 08-002 /
08-003 / 08-008): a provider-neutral `SchoolConnector = Connector<SchoolPayload>`,
`translate()` from provider records to canonical items, `syncSchool()` with
health states and the invariant that a portal can never report work *done*,
real DB-backed ports, and a fixture. What was missing was the **list**: nothing
registered any school provider, so `getConnector("school", …)` always returned
null and the whole pipeline was unreachable.

Added `packages/core/src/school/providers.ts` — the catalog:
- `SchoolProviderDescriptor`: `id`, `label`, `auth` (`manual | credentials | oauth`),
  `blurb`, `scopes`, `requiredEnv`, `adapterReady`, `portalUrl?`.
- `SCHOOL_PROVIDERS`:
  - `manual` — **Forward to WonderHome**. Works for any school, no setup; items
    arrive through HomeSend, so it has no sync connector.
  - `demo-school` — a development fixture (`WONDERHOME_SCHOOL_DEMO`), openly fake.
  - `loop-learning` — named and env-gated (`LOOPLEARNING_USERNAME` /
    `LOOPLEARNING_PASSWORD`), `adapterReady:false` → listed but unconnectable
    until a real adapter and its integration tests ship.
- `schoolProviderAvailability()` / `schoolProviderCatalog()` — gate on env;
  `connectable` is true only for the forward path and for shipped+configured
  adapters, so a merely-named portal never masquerades as connected.
- `createSchoolProviderConnector()` / `schoolConnectorFor()` — return a
  `SchoolConnector` only when a provider could actually sync; still `live:false`.
- `registerSchoolProviders()` — idempotent; populates the shared registry.

Wired into the existing sync route
(`apps/web/app/api/v1/households/[householdId]/integrations/school/sync/route.ts`):
it calls `registerSchoolProviders()` before `getConnector`. With no portal env —
every deployment today — nothing registers and the route still answers
"not configured" honestly.

## Why it is shaped this way
CLAUDE.md governs liveness: a provider is live only once its credentials, a
guardian's consent, authentication and integration tests exist. So the catalog
can *name* a portal and a deployment can *set its credentials*, but connecting it
syncs nothing until an adapter ships — the catalog is the extensible seam, not a
live integration. The one option that genuinely works for every family today is
the forward path, which needs no school cooperation at all.

## Verified
- `school/providers.test.ts` — 10/10 (catalog order, env gating, `connectable`
  logic, "no live portal adapter" guard, idempotent registration, a full sync
  through a catalog provider).
- School unit suite 122/122; `@wonderhome/core` typecheck clean; `apps/web`
  typecheck clean; web route lints clean.
- No migration, no secrets, no live portal.

## Open / needs a person
- **08-029 — the Connect-school screen**: provider picker, per-portal auth +
  guardian consent, external-child-id → member mapping, honest availability
  states, eight languages, 360px/desktop QA. Sizable and user-facing; proposed,
  not built here.
- No portal adapter is live. Loop Learning (or any portal) going live needs a
  real adapter, the account holder's consent, credentials stored as secrets
  (`LOOPLEARNING_*`, never in code), and integration tests — a separate story.

## Where the code lives
- `packages/core/src/school/providers.ts` (+ `providers.test.ts`)
- `apps/web/app/api/v1/households/[householdId]/integrations/school/sync/route.ts`
- Backlog: `backlogs/08-Kids-and-School-Intelligence.md` (08-028 Done, 08-029 Not Started)
