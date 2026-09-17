# WonderHome — Architecture Decisions

## ADR-001 — Next.js responsive web/PWA instead of React Native
**Decision:** Use Next.js App Router with responsive mobile-first UI.
**Reason:** Matches WonderArk stack, keeps one codebase for mobile/desktop and avoids introducing a second client runtime.

## ADR-002 — Supabase PostgreSQL
**Decision:** Supabase is the system-of-record database and auth/session foundation.
**Reason:** Matches WonderArk core and provides PostgreSQL, RLS and SSR integration.

## ADR-003 — AI provider abstraction with Anthropic primary
**Decision:** Vercel AI SDK is the abstraction; Anthropic Claude is the primary provider; Google Gemini and OpenAI are supported alternatives.
**Reason:** Preserves provider flexibility while establishing a deterministic default.

## ADR-004 — API-first domain architecture
**Decision:** UI and AI agents consume `/api/v1`; domain services own business logic.
**Reason:** Enables mobile/desktop reuse, integrations and safe agent tooling.

## ADR-005 — Security by construction
**Decision:** Tenant isolation, RBAC, RLS, audit and secret handling begin in bootstrap and identity/API stories.
**Reason:** Security cannot be bolted on after domain implementation.

## ADR-006 — Provider-neutral external integrations
**Decision:** External providers are adapters behind canonical interfaces; unavailable providers use deterministic mocks/fixtures.
**Reason:** Prevents fake integrations and avoids blocking unrelated development.

## ADR-007 — Background work runs on a Postgres-backed job queue
**Decision:** Durable scheduled and deferred work is stored in a `jobs` table in
the same Supabase database and claimed with `FOR UPDATE SKIP LOCKED` by a worker
endpoint that an external scheduler pokes on a fixed cadence.

**Context:** The outcome engine (module 03) must evaluate whether outcomes are
on track, detect exceptions and replan; notification timing (06-004) must
deliver at a useful moment rather than at the moment of the event; the agent loop
(14-003) must observe, plan, act and monitor over time. All three need work that
survives a restart and happens without a request. No backlog story creates that
machinery, and `TECH-STACK-AND-NFR.md` says only that long-running work must be
asynchronous.

**Reason:**
- One datastore. A job and the rows it acts on commit together, so a job cannot
  claim to have done something the database never recorded.
- It is testable in the harness that already exists — the same throwaway
  database the RLS tests build, rather than a service that has to be stubbed.
- `FOR UPDATE SKIP LOCKED` is the standard, well-understood way to hand out work
  to concurrent consumers without double-claiming.
- It keeps deployment adapter-neutral, which ADR-001 and the stack document both
  ask for. Any host that can call a URL on a schedule can run it.

**Rejected:** a managed queue service (SQS, QStash, Inngest). Less code, but it
adds a vendor the ADRs deliberately avoided, splits the transaction boundary
between queue and database, and cannot be exercised by the existing test
harness. Worth revisiting if throughput ever exceeds what one Postgres table
comfortably serves — at the 25,000-household scale target it will not.

**Consequences:** the queue's own guarantees have to be built and tested rather
than bought: visibility timeouts, retry with backoff, a dead-letter state, and
idempotent handlers. A scheduler is an external dependency; the worker endpoint
is authenticated and safe to call more than once.

## ADR-008 — Entitlements and the connector contract are built before the domains that use them

**Decision:** Story 17-001 (connector framework) and stories 20-001 through
20-003 (plans, entitlements, usage metering) are implemented ahead of the
Phase 5 household domains, rather than in Phase 6 where
`tracking/IMPLEMENTATION-ORDER.md` places them.

**Context:** Every Phase 5 module — school, commerce, meals, bills, family time —
carries the same two acceptance criteria. One says a direct API call cannot
bypass the entitlement decision even when the UI does not render the feature.
The other says provider integrations implement a common contract for
credentials, health, sync and revoke, with canonical models that stay
provider-independent.

Built in phase order, each of those five modules would grow its own entitlement
check and its own provider adapter shape, and the shared versions would arrive
afterwards as a refactor across code that already shipped. Module 13 is the
evidence: `checkWeatherAccess` in `home/weather.ts` had to invent a local
entitlement result type because no service existed to ask.

**Reason:**
- An entitlement rule enforced in five places is five chances to differ. The
  criterion is explicitly that it is checked "server-side through one
  entitlement service".
- A connector contract is only worth having before there are connectors. Written
  afterwards it describes what the adapters already do instead of constraining
  them.
- Neither story depends on any Phase 5 work, so nothing is being built out of
  dependency order — only out of listed order.

**Rejected:** following the phase list and refactoring later. The refactor would
touch five modules' routes and tools at once, which is the change most likely to
open a hole in exactly the check that is meant to be uniform.

**Consequences:** module 20's remaining stories (upgrade/downgrade, usage UI,
billing abstraction) still sit in Phase 6, and module 17's provider connectors
land with the domains that need them. `checkWeatherAccess` is superseded by the
shared service and is reduced to a caller of it.
