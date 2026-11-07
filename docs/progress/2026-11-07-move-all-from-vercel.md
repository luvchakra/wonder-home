# Move all from Vercel: one button (16-010 follow-up)

Owner, 2026-11-07, looking at Integrations rows that said "From Vercel": "instead create one transfer button which I can click and everything gets migrated".

## What was done
- **Platform admin → Configuration → Move all from Vercel** (linked from the Integrations and Secrets headers). Owner only. No password step-up: the owner asked for none ("no need to ask for this password", 2026-11-07). The values never leave the server, and the single-setting editors still ask for the password on a secret.
- Server only (`packages/core/src/platform/settings/move.ts`, action `moveAllFromVercelAction` in `apps/web/app/platform-admin/settings-actions.ts`): every registry setting whose value comes from `process.env` and has nothing saved is validated against its registry entry and saved in one call.
- New service-role function `public.platform_config_import(jsonb, uuid)` (`supabase/migrations/20261107230000_platform_config_import.sql`): one transaction, a transaction lock against two runs at once, the staff check and rate limit once, a setting in the table and a secret in Vault exactly as the single saves do, one `platform.config_changed` audit row per key (`via: move_from_vercel`, only "changed" for a secret) and one `platform.config_moved` summary row (counts and names). It never overwrites: a saved key comes back `already`. Before the migration, the code falls back to saving one at a time.
- After the move it reads everything back through `platform_config_status`: a setting must equal Vercel's value, a secret's last four must match. The answer is names, counts and words only: moved, already in the portal, not set, must stay in Vercel, and per setting Moved / Already here / Check it / Not moved.
- Then a **Safe to delete in Vercel** list with **Copy list** (moved and already-saved keys, plus the unused `SECRET_ENCRYPTION_KEY`), and the **Must stay in Vercel** variables that are set, each with its reason. Nothing in Vercel is deleted by the app (no Vercel token), and the environment stays the fallback in code.
- The must-stay list now lives in the registry (`STAYS_IN_VERCEL`, `UNUSED_IN_VERCEL`); `registry.test.ts` checks no registry key is in it, and the move skips any key on it regardless.
- Owner's guide `docs/admin-portal-config-migration.md` now leads with the one-button path.

## Verified
- `apps/web/app/platform-admin/move-action.test.ts`: support and operators refused before anything is read; no password asked; bootstrap keys (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`) never sent; no secret, nor its last four, in the action's answer or any log line; the item shape is `key, label, secret, outcome, words`; a second run moves nothing; a saved value is not overwritten; a read-back mismatch is reported and not listed as safe to delete; an invalid Vercel value is reported, not moved. 60 tests in `platform-admin/` and `platform/settings/` pass.
- `scripts/test-platform-config-rls.mjs`: anon and signed-in sessions can't call the function; a non-staff actor is refused; existing values kept; one audit row per moved key plus a summary; a second run moves nothing. 6 pass, 2 Vault cases skip locally (no Vault).
- Live project: migration applied (version 20261107230000). The Vault path was run inside a block that rolled back: the secret was moved, its last four read back, and no audit row held it; a count then showed nothing left behind (no config row, Vault secret or audit row).
- Typecheck, ESLint, `lint:migrations`, `lint:service-role`, `cache-headers` and `client-writes` tests, `npm run build -w apps/web`, `check:bundle` (now also guards `platform_config_import`) all green.

- Browser, 360 px and 1280 px: a production build against the live project, signed in as a QA staff owner. The server's environment held no registry setting, so the run moved nothing ("Nothing new to move … 4 must stay in Vercel"); there was no horizontal overflow, and the Integrations and Secrets links are present. That run still had the password step-up, which was removed afterwards at the owner's request. Cleanup: the QA account was deleted with `qa-test-user.mjs delete e29b130f-c853-457b-8f0c-0da7a89c1f57`, along with its `profiles` and `platform_admins` rows.

## Open
- The button can't delete Vercel variables; the owner deletes the copied list and redeploys.
