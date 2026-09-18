# Database moved to the Mumbai Supabase project

**Date:** 2026-09-18 · **Kind:** infrastructure

## What was done

The application now runs against a new Supabase project, reference
`kqxndableyysxqhxiorz`, in `ap-south-1` (Mumbai). The previous project
(`stehegovxlssxdepiruk`, Tokyo) is no longer used by the code.

- All 23 migrations under `supabase/migrations/` were applied to the new
  project, in order, through the Supabase MCP `apply_migration` tool (port
  5432 is unreachable from the build sandbox; the HTTPS API is not).
- `vercel.json` pins the functions to `bom1` so they sit beside the database
  (the previous pin was `hnd1`).
- Test fixtures and `design/DESIGN-NOTES.md` reference the new project.
- Local credentials live only in the gitignored `apps/web/.env.local`.

## Why

The user created the new instance and asked for the migration. Co-locating
functions and database is the single largest latency win identified in the
performance pass (see the 2026-09-17 note).

## Verified

- `npm run verify:live` against the new project: 59/59 at the time of the
  move (61/61 after the two migrations added later the same day). Every
  shipped table present, every PostgREST embed resolves, anonymous callers
  refused the privileged RPCs and a forged audit event.
- Supabase security advisor: one warning, `public.rls_auto_enable`, which
  is Supabase's own platform helper on new projects, not ours. Left alone.
- Typecheck, lint, secret lint, 635 unit tests.

## Still open — needs a person

1. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` on the Vercel `wonderhome` project and
   redeploy. Until then production still talks to the old database.
2. Rotate the service-role key and the database password: both passed
   through a chat transcript.
3. The old project held one household (two users). It was not copied; sign up
   fresh or ask for it to be migrated.
4. Pause or delete the old project once production is on the new one.

## Where

`vercel.json`, `supabase/migrations/`, `scripts/verify-live-project.mjs`,
`packages/core/src/config/*.test.ts`, `design/DESIGN-NOTES.md` (Performance
rules).
