# Platform staff from `WONDERHOME_PLATFORM_ADMINS` (2026-11-22)

**Asked (owner):** "create a vercel variables for setting platform admins based on emails".

**Done**
- `WONDERHOME_PLATFORM_ADMINS` (Vercel only, `STAYS_IN_VERCEL`): comma-separated `email` or `email:role` (support | operator | owner; default operator).
- `packages/core/src/platform/admins-variable.ts`: parse, verified-email match (confirmed email, or a Google identity Google verified; phone-only never), and the row change (grant / role change / reactivate / suspend) only for `source = 'variable'` rows. Manual rows are never touched. Runs at sign-in (`auth/callback`, password sign-in) and once per person per server start inside `platformStaff` (no query after that). Uses `adminGrant.worker`. Audits `platform_admin.granted | role_changed | suspended` with the email only as a fingerprint and masked form.
- Migration `20261122190000_platform_admins_source.sql`: `source text not null default 'manual'` + check. Safe in either order (old code ignores it; the Security page selects `*`; the sync logs and skips if the column is missing).
- Platform admin → Security: staff list with masked email and source, read-only. Configuration health line when the variable is set but empty or partly not understood.
- Docs: `.env.example`, `docs/hosting.md`, `docs/external-providers.md`.

**Verified**
- `admins-variable.test.ts` (20), `platform-staff.test.ts` (6), platform settings and audit tests: pass. `npm run security`: pass. Typecheck (core, web): clean.
- `scripts/test-platform-admin-rls.mjs` on a fresh database (248 migrations): 13/13, including two new cases: nobody can promote, reactivate or re-source a staff row from a browser session, and `source` takes only `variable` / `manual`.
- `e2e/platform-admin.spec.ts` locally: 2 passed, 4 skipped (signed-in cases need live E2E credentials, not available in this session).
- lint: service-role, migrations, secrets, boundaries pass.

**Open / needs a person**
- The migration must be run on the live project (SQL given to the owner; not applied from this session).
- Set the variable in Vercel and redeploy; sign in with the listed email.
- No test data was created on the live project.
