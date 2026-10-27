# 2026-10-27 — Portal fetch: Connect-school UI + twice-daily schedule (08-033 complete)

Closes story **08-033** (generic school-portal fetch). The earlier slices (1–5) built
the engine, data model, orchestrator, Fly worker and extraction/filing. This finishes
the remaining user-facing and scheduling work.

## What was done

**Slice 6 — Connect-school UI (PR #400).**
- `apps/web/app/_components/school-connect.tsx`: a **Pages to read** section on a
  connected portal — add a post-auth page (web address + kind + optional child),
  stop/resume, remove. A **reconnect banner** when the worker marks the session
  `reconnect_needed`.
- `apps/web/app/(auth)/school-actions.ts`: `addPortalScrapeUrlAction` /
  `removePortalScrapeUrlAction` / `setPortalScrapeUrlEnabledAction`; the URL is
  validated same-site against the stored portal URL **server-side** (SSRF guard).
  **Fetch now** and **Test connection** now enqueue a real `portal_fetch_job`
  (`enqueue_portal_fetch_job`) instead of the old dead button; findings arrive in
  HomeSend for confirmation.
- `apps/web/app/household/integrations/school/page.tsx`: loads scrape URLs +
  per-connection session state in the existing `Promise.all` wave.
- `apps/web/app/_lib/school-connect-labels.ts` + `school.connect.pages.*` /
  `school.connect.reconnect.needed` in all eight languages.

**Slice 7 — twice-daily schedule (this PR).**
- `supabase/migrations/20261027210000_portal_fetch_schedule.sql`: two pg_cron jobs,
  `wonderhome-portal-fetch-morning` (`30 1 * * *` ≈ 07:00 IST) and `-evening`
  (`30 13 * * *` ≈ 19:00 IST), each `select public.enqueue_all_portal_fetch_jobs()`.
  That function is idempotent (skips any connection with an open job), so the DB's
  single clock fires it once regardless of how many worker machines are up, and it
  survives a worker restart — cleaner than a `setInterval` inside the worker, which
  is why the queue migration's comment already pointed at pg_cron. Guarded by
  `pg_available_extensions` so a local test DB skips it.

## Verified

- typecheck (core + web), lint (core + changed web files) — clean.
- i18n parity (`translate.test.ts`, 7/7): every language carries every English key.
- `npm run build -w apps/web` — green.
- `lint:migrations` — 181 migrations pass.
- Migration applied live (`kqxndableyysxqhxiorz`); both cron jobs confirmed `active`
  in `cron.job`.

## Deferred — need the owner, not built

- **Loop-Learning-specific API adapter.** Not built, by design. The API path
  (reimplementing Loop Learning's request/response crypto) was rejected up front in
  favour of reading the rendered DOM; the generic adapter already covers Loop
  Learning that way, and a precise endpoint split can't be verified without using
  the parent's live sign-in — which this work must never do.
- **KMS/Vault encryption-at-rest for portal secrets.** A security-architecture
  decision. The portal password today sits in a `select`-revoked, service-role-only
  column — the same accepted bargain `voice_credentials` strikes. Moving to
  pgsodium/Vault TCE would diverge from that established pattern and migrate existing
  rows, so it belongs in a separate hardening story covering *both* credential stores
  at once. Recommended, not done unilaterally.

## Where the code lives

`apps/web/app/_components/school-connect.tsx`, `apps/web/app/(auth)/school-actions.ts`,
`apps/web/app/household/integrations/school/page.tsx`,
`apps/web/app/_lib/school-connect-labels.ts`,
`packages/core/src/i18n/messages/areas/school/*.ts`,
`supabase/migrations/20261027210000_portal_fetch_schedule.sql`.

## Open

- PR #400 (UI) and this PR (schedule) are both on auto-merge; merge checks scheduled.
- The owner should still **rotate the Loop Learning password** (it was shared in an
  earlier session's context; it was never written to a repo file, commit, log or used
  to log in).
