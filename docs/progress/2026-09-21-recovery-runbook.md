# Recovery runbook, and a real production finding it turned up (19-008)

**Date:** 2026-09-21
**Area:** `docs/RECOVERY-RUNBOOK.md`

## What was done

Story 19-008 ("Recovery/runbook — validate backup/restore and operational
runbooks") had no runbook anywhere in the repository before this pass;
`TECH-STACK-AND-NFR.md` stated an RPO ≤ 15 minutes and RTO ≤ 1 hour target,
but nothing documented how those targets are actually met, how to restore,
or how to prove a restore worked.

`docs/RECOVERY-RUNBOOK.md` covers:

- The RPO/RTO targets, restated from the NFR document rather than
  duplicated with different numbers.
- What backs the data up (Supabase-managed Postgres, WAL-based PITR),
  deliberately without restating the specific retention window, since that
  is a dashboard-configured, plan-tier setting that would silently go
  stale the moment it changed if copied into a markdown file.
- Two restore paths: a PITR restore (the normal case, inside the RPO
  window) and a full rebuild from `supabase/migrations/` (total loss, or a
  fresh environment) — and a point worth making explicit: the rebuild path
  is not an untested emergency-only procedure. It is exactly what
  `scripts/setup-test-db.mjs` already does on every `test:db` CI run, so
  it is proven continuously (34 migrations, 224 RLS tests as of this
  pass), not something that would only get exercised for the first time
  during a real incident.
- A four-step post-restore verification sequence, each step checking
  something the previous one cannot: `test:db` (policy correctness),
  `verify:live` (did the *deployment* actually match — the one existing
  script in this repo built for exactly this, and previously unused for
  this purpose), the liveness/readiness endpoints from 19-004, then
  `get_advisors` for regressions.
- An incident-detection section grounded in what already exists
  (structured `requestId`-carrying logs, the readiness endpoint's degraded
  state) rather than inventing new tooling, and an explicit non-answer for
  escalation contacts and on-call process — those are organizational
  decisions this document cannot make up on a team's behalf.

## What this pass found, and why it wasn't fixed here

Rather than write the runbook from assumptions, this pass read the live
`wonderhome` Supabase project's actual security and performance advisories
(`mcp__Supabase__get_advisors`, read-only). That turned up a real,
previously-unrecorded gap: `rls_auto_enable()`, a `SECURITY DEFINER`
event-trigger function that auto-enables RLS on any new `public` table as
a safety net, is live on production and callable via PostgREST RPC by
`anon`/`authenticated` — and **does not appear in any file under
`supabase/migrations/`**. It exists on the live database without a
migration behind it, which means the full-rebuild recovery path this
runbook documents would not reproduce it.

This is exactly the kind of thing a recovery runbook exists to catch. It
was not fixed in this pass, on purpose: closing it means a live production
database change (revoking EXECUTE, and/or formalizing the function and
its event trigger into a migration), and this session could not confirm
how migrations actually reach the `wonderhome` project — `.github/workflows/ci.yml`
has no step that applies them, so either a person applies them manually or
a previous session did so directly. Making an unreviewed, un-PR'd change
to a live production database on an assumption about a process this
session couldn't verify is exactly the kind of production/infrastructure
action CLAUDE.md asks to be treated as blocking rather than acted on
unilaterally. It is recorded in the runbook's **Still open** section
instead, with enough detail (the function's exact behavior, why the
advisor flags it, why it's low-severity in practice) for whoever picks it
up next to act without re-deriving any of this.

The performance advisories (82 unindexed FKs, 53 unused indexes, 4
`auth_rls_initplan`, 42 `multiple_permissive_policies` — all WARN/INFO,
none release-blocking per the NFR document's gate) are recorded as a
dated baseline, not addressed; a dedicated pass in the spirit of 19-007
would be the right way to work through them.

## Where the code lives

- `docs/RECOVERY-RUNBOOK.md` (new).
- `backlogs/19-Testing-Observability-and-Production.md`, `tracking/PROGRESS.md`, `docs/PROGRESS.md` — 19-008 marked Done.

## Verified

- `npm run typecheck`, `npm run lint`, `npm run lint:boundaries`, `npm run lint:embeds`, `npm run lint:migrations`, `npm run brand -- --check`, `npm run tracker -- --check` — all clean (docs-only change; nothing here touches code).
- `npm run test` — 1313 unit tests across 96 files, unaffected.
- `npm run test:db` — 224 database tests, unaffected. (A local Postgres cluster restart was needed mid-session for an unrelated environment reason — noted here only because the first run failed for that reason, not because of this change.)
- `npm run build` — clean.
- `npm run test:e2e` — 256 passing.
- `mcp__Supabase__get_advisors` (security + performance) against the live `wonderhome` project (`kqxndableyysxqhxiorz`) — read-only, the source for the production baseline section.

## Still open

- The `rls_auto_enable()` schema-drift finding above — needs a person with
  Supabase access, or a session with clearer context on how this
  project's migrations actually reach production.
- The PITR retention window has not been confirmed against the RPO
  target — a Supabase dashboard check, not something this session's
  tools can read.
- No actual restore drill has been run — the runbook documents the
  procedure and the continuously-proven rebuild path, not a timed,
  real "clicked restore on a real backup" exercise.
- The 42 `multiple_permissive_policies` and 4 `auth_rls_initplan`
  performance findings are worth a dedicated pass.
