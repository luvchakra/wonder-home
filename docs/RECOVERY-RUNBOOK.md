# Recovery runbook

**Story:** 19-008. **Last validated:** 2026-09-21.

This is the operational answer to "the database is gone or corrupted, now
what" — the targets it has to meet, what actually backs the data up, the
restore procedure, and how to prove afterward that the restore worked. It
also records what this pass found when it checked the live project against
those targets, including what it could not close.

## Targets

From `TECH-STACK-AND-NFR.md`:

- **RPO ≤ 15 minutes** — at most 15 minutes of writes may be lost.
- **RTO ≤ 1 hour** — core application/data recovery within an hour.
- External provider outages must degrade gracefully and never corrupt
  household state.

## What backs the data up

The database is Supabase-managed Postgres (project `wonderhome`,
`ap-south-1`, Postgres 17). Supabase backs up every project on paid tiers
with continuous WAL archiving, which is what makes point-in-time recovery
(PITR) to any moment possible, plus daily logical/physical snapshots. The
exact PITR retention window is a plan-tier setting configured in the
Supabase dashboard (**Database → Backups**) — this document does not
restate it, because a number copied here would silently go stale the next
time the plan changes; check the dashboard, not this file, before relying
on a specific window.

Two facts matter for the RPO target specifically:

- WAL-based PITR is what makes a 15-minute RPO achievable at all — a
  daily-snapshot-only backup would not meet it.
- Confirming the actual configured retention meets or exceeds the RPO
  target is a dashboard check this session's tools cannot perform (project
  plan/billing detail is not exposed through the available Supabase MCP
  tools) and is listed under **Still open** below.

## Restoring

1. **Point-in-time restore (the normal path, data loss inside the RPO
   window).** Supabase dashboard → the project → **Database → Backups** →
   pick the point in time → restore. This is a Supabase-managed operation;
   it provisions a restored database and swaps the project's connection
   over to it. Do not run this against a project with live traffic without
   the person who owns Supabase access, since it is a real, billed,
   user-facing operation, not something to script casually.

2. **Full rebuild from migrations (total loss, or standing up a fresh
   environment).** This path does not depend on Supabase's backups at
   all — it is exercised on every CI run, not just when disaster strikes:
   - Create a fresh project (or use `mcp__Supabase__create_project`).
   - Apply every migration in `supabase/migrations/` **in filename order**
     (`lint:migrations` already enforces 14-digit timestamp filenames for
     exactly this reason — order is the whole point). Either
     `supabase db push` from the CLI or the `apply_migration` MCP tool,
     one file at a time, in order.
   - This is the same thing `scripts/setup-test-db.mjs` does to build a
     fresh Postgres database for every `npm run test:db` run — as of this
     pass, that is 34 migrations producing a schema that then passes 224
     RLS/authorization tests. A full-rebuild recovery is therefore already
     continuously validated by CI; it is not an untested path that would
     only be exercised in a real emergency.
   - What this path cannot recover: the household data itself. It rebuilds
     schema, RLS, functions and seed data (`plans`/`plan_features`), never
     rows a family wrote. It is the right tool for "the project is gone
     and we are starting a new one," not for "we lost an hour of writes."

3. **Point application traffic at the restored/rebuilt project.** Update
   `NEXT_PUBLIC_SUPABASE_URL` / the anon key / the service-role key
   wherever they are configured (Vercel project environment variables),
   redeploy, and only then let traffic through.

## Verifying a restore actually worked

Run these against the restored project before calling it done — in order,
because each one checks something the previous one does not:

1. `npm run test:db` (with `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`
   pointed at it) — proves every RLS policy is present and behaves as every
   other story in this codebase has tested it to. This is schema/policy
   correctness, not proof the *live* deployment matches.
2. `npm run verify:live` (needs `SUPABASE_SERVICE_ROLE_KEY` — deliberately
   never runs in CI, since that key bypasses RLS entirely) — proves the
   migrations actually reached the project, the service-role path works,
   and an anonymous caller is refused what it should be. This is the one
   check that answers "did the restore really apply everything," not just
   "would a correct schema pass."
3. `GET /api/v1/health` then `GET /api/v1/health/ready` — liveness first
   (the process is up), then readiness (it can actually reach the
   database). 19-004 built these as two separate signals on purpose: a
   process that is up but cannot reach a freshly-restored database should
   report degraded on the second, not healthy on the first and call it done.
4. `mcp__Supabase__get_advisors` (security) — a restore that reintroduced
   an old, since-fixed policy gap would show up here; compare against the
   baseline this pass recorded below.

## Detecting and responding to a database outage

- **Detection:** every log line is structured JSON carrying a `requestId`
  (`packages/core/src/observability/logger.ts`), and 19-004's readiness
  endpoint reports degraded the moment the app can reach the database. A
  spike in `/api/v1/health/ready` failures, or in `error`-level log lines
  naming a Postgres error code, is the signal — never household content,
  since every log field is redacted before it is written.
- **Escalation:** who gets paged and how is an operational decision this
  document cannot make on its own — it depends on who currently holds
  Supabase/Vercel access and what on-call tooling (if any) this team runs.
  Recorded here as an open item rather than invented, so nobody mistakes a
  placeholder for a real contact.
- **Communication:** once degraded, a family reaches whatever the
  degraded-mode UI shows rather than a raw error — this is existing
  behavior from 19-004's liveness/readiness split, not new to this note.

## Production baseline (this pass, 2026-09-21)

Read-only checks against the live `wonderhome` project
(`kqxndableyysxqhxiorz`, `ap-south-1`) via `mcp__Supabase__get_advisors`.
Nothing below was changed by this pass — see **Still open**.

**Security** (3 WARN categories, 0 ERROR):

- `rls_auto_enable()` — a `SECURITY DEFINER` event-trigger function that
  auto-enables RLS on any new `public` table, as a safety net against a
  migration that forgets to. It is flagged because it is callable via
  PostgREST RPC by `anon` and `authenticated` — in practice Postgres
  refuses to invoke an event-trigger-return-type function outside an
  actual trigger, so this is exposed-surface hygiene rather than a live
  exploit path, but it should not be reachable from the API at all.
  **It does not appear in any file under `supabase/migrations/`** — it
  exists on the live project without a corresponding migration, which is
  itself the finding this runbook exists to catch: a full rebuild from
  this repo's migrations (path 2 above) would **not** recreate it, so a
  household created after a full rebuild would lose this particular safety
  net silently.
- Three other `SECURITY DEFINER` functions (`ai_credential_status`,
  `mark_member_seen`, `voice_credential_status`) are callable by
  `authenticated` — plausibly intentional (each takes a `household_id` and
  is presumably meant to be called by a member of that household), but not
  verified as part of this pass; each is defined and covered in an
  existing migration, so they are not a schema-drift concern the way
  `rls_auto_enable` is.
- Leaked password protection is disabled in Supabase Auth — a one-click
  dashboard setting (**Auth → Policies**), not a schema change.

**Performance** (4 categories, 0 ERROR): 82 unindexed foreign keys (INFO),
53 unused indexes (INFO), 4 `auth_rls_initplan` findings (WARN — a policy
re-evaluates `auth.*()` per row instead of once per query), 42
`multiple_permissive_policies` findings (WARN — more than one permissive
policy for the same role/action on a table, which Postgres must evaluate
as an OR of both). None are release-blocking per the NFR document's "no
critical/high finding" gate — all are WARN/INFO — but a dedicated
performance pass (in the spirit of 19-007) would work through them
deliberately rather than as a side effect of this story.

## Still open

- **The PITR retention window has not been confirmed against the 15-minute
  RPO target.** Check Supabase dashboard → Database → Backups on the
  `wonderhome` project.
- **`rls_auto_enable()`'s schema drift is not fixed.** Closing it means
  either writing a migration that formalizes the function and event
  trigger (so a full rebuild reproduces it) and revoking public EXECUTE,
  or deciding it should not exist at all. Either is a live production
  database change, and this pass could not confirm how migrations actually
  reach the `wonderhome` project (no CI step applies them — see
  `.github/workflows/ci.yml`), so making that change here risked doing it
  outside whatever deployment process is actually in use. Left for a
  session with that context, or for whoever owns Supabase access to apply
  directly.
- **No actual restore drill has been run.** Everything in **Restoring**
  above is the documented procedure and the CI-proven rebuild path — not
  the same as having actually clicked "restore" on a real backup and timed
  it against the 1-hour RTO. A real drill is a billed, production-adjacent
  action that needs a person with Supabase access, not something to
  script unilaterally.
- The 42 `multiple_permissive_policies` and 4 `auth_rls_initplan` findings
  are worth a dedicated pass; not attempted here.
