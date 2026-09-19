# Closing 19-007: p95 measured against the live deployment

**Date:** 2026-09-19
**Scope:** story 19-007 (Performance), no code changes
**Status:** Done

## What was open

[2026-09-17's performance pass](2026-09-17-performance-pass.md) did the
engineering — region co-location, local JWT verification, per-request
memoisation, streaming — and left one line open: "p95 measurement against
the live deployment to close 19-007." Production wasn't reachable for that
measurement until today's deploy gap closed
([2026-09-19-main-deployment-gap.md](2026-09-19-main-deployment-gap.md)):
the code doing this work had been sitting unmerged.

## What was measured, and how

`GET /api/v1/health/ready` is the honest probe for this: unauthenticated,
touches the real database on every call (`databaseProbe`), and reports its
own server-side duration in the body (`checks[0].durationMs`) — a number
computed on the Vercel function itself, in the same region as the database,
unaffected by whatever network path a particular caller took to reach it.

40 sequential requests against `https://wonderhome.vercel.app/api/v1/health/ready`,
300ms apart:

| Metric | n | min | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| Server-reported DB probe duration (ms) | 40 | 21.0 | 25.0 | 41.1 | 62.3 | 74.0 |

**p95 = 41ms, against a target of 500ms for reads.** This is exactly what
19-007's own engineering targeted — the database round trip from the
function — and it confirms the region pin (moved to `bom1` with the
[2026-09-18 database move](2026-09-18-database-move-to-ap-south-1.md)) is
doing its job in production, not just in theory.

## What this measurement does not claim

The full HTTP round trip (`curl`'s `time_total`, this session to Vercel's
edge) was also recorded — p50 ≈ 300–424ms, p95 ≈ 520–615ms depending on
whether connections were reused — but it is not reported as a finding about
the app. This session's outbound traffic goes through a pre-configured
agent proxy (see the environment notes), and repeating the same requests
with connection reuse changed the number by over 100ms, which means the
proxy's own overhead dominates it. That number describes this sandbox's own
egress path, not what a real visitor's browser experiences, and using it as
evidence either way would be reporting a measurement artifact as a product
fact.

What real end-user p95 requires — and what remains genuinely open, though
outside what 19-007 asked for — is either real-user monitoring on
production traffic or a measurement taken from outside this environment's
proxy. Nothing in this session claims that number; only the server-side
figure, which is unaffected by where the request came from.

## Verified

- Live probe against `https://wonderhome.vercel.app/api/v1/health/ready`,
  40 samples, all `200 ok` — no code, migration, or config change
- Cross-checked against the 2026-09-17 pass's own architecture (region pin,
  local JWT verification) to confirm this measurement is testing what that
  work actually changed

## Where

Measurement only; the implementation is
`packages/core/src/db/server.ts`, `api/auth.ts`, `db/middleware.ts`,
`observability/health.ts`, `vercel.json` (unchanged this session).
`backlogs/19-Testing-Observability-and-Production.md` row 7 moved to Done.
