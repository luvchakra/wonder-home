# Feature flags and a platform-wide audit trail (16-008)

**Date:** 2026-09-21
**Area:** `packages/core/src/platform/feature-flags.ts`, `audit-log.ts`; `household_feature_flags` migration

## What was done

Story 16-008 ("Feature flags/audit — manage flags and audit logs") was the
last untouched story in module 16 (Platform Admin & Operations); 16-001
through 16-007 (this session's own 05-007 aside — that is module 05) were
already `Done`. Nothing in the codebase implemented either half of this
story before now: no feature-flag table or service existed anywhere, and
platform staff had no way to read the audit trail except per household
through a support-access grant.

**Feature flags.** `household_feature_flags` (new table) holds one row per
household per flag key, written only by the admin client — there is no
client-facing INSERT or UPDATE policy, confirmed by
`scripts/test-feature-flags-rls.mjs`. `setHouseholdFeatureFlag` (in the new
`platform/feature-flags.ts`) is a reason-coded, audited action requiring
the `feature_flags.manage` capability (operator and owner only, matching
`subscription.manage`'s tier — support has no standing here, same as it
cannot manage a subscription), built on exactly 16-005's shape: check the
role, validate the input, upsert the row, record an audit event. The flag
key is validated against a shape (`^[a-z][a-z0-9_.]{1,80}$`) rather than a
fixed catalog, because the set of flags this product actually has changes
with the code and pinning it in a migration or a `PlatformAdmin`-facing
enum would mean a schema change every time a flag is added — this module
owns the boundary (who may set one, that it's reasoned and audited), not
which flags exist. A household reads its own flags through ordinary RLS:
what WonderHome has turned on for a family is not staff's business to hide
from the family it concerns, the same reasoning that already makes a
support-access grant visible to its household.

**Platform-wide audit.** `audit-log.ts`'s `listPlatformAuditEvents` reads
`audit_events` across every household via the admin client, gated behind a
new `audit.read_platform` capability (operator and owner). This does not
relax what is shown — every row already passed `redact()` before it was
ever written (`api/audit.ts`), which is what already makes a household's
own Activity screen (15-006) safe. This function only widens *who* may read
those same, already-safe rows to include platform staff working across
households, never what is safe to include.

**A real safety net caught a real gap.** `security/sensitive-actions.ts`
(15-006) keeps a catalogue that every audit event the enum names must be
both actually recorded somewhere and given a household-facing description
— its own coverage test failed the build the moment `feature_flag.changed`
was added to `AUDIT_EVENTS` without a catalogue entry or a
`describeAuditEvent` case. Both are added now: the catalogue points at
`platform/feature-flags.ts`, and the household-facing description reads
"A feature was turned on/off" with the flag key as detail — exactly the
kind of gap that module's own comment says exists to make impossible to
create quietly.

## Where the code lives

- `supabase/migrations/20260921060000_household_feature_flags.sql` (new) — the table and its RLS.
- `packages/core/src/platform/feature-flags.ts` / `.test.ts` (new) — `setHouseholdFeatureFlag`, `listHouseholdFeatureFlags`.
- `packages/core/src/platform/audit-log.ts` / `.test.ts` (new) — `listPlatformAuditEvents`.
- `packages/core/src/platform/admin.ts` — `feature_flags.manage` and `audit.read_platform` added to operator/owner capabilities.
- `packages/core/src/api/audit.ts` — `feature_flag.changed` added to `AUDIT_EVENTS`.
- `packages/core/src/security/sensitive-actions.ts` — catalogue entry and description case for the new event.
- `scripts/test-feature-flags-rls.mjs` (new) — 4 database tests.
- `backlogs/16-Platform-Admin-and-Operations.md`, `tracking/PROGRESS.md`, `docs/PROGRESS.md` — 16-008 marked Done.

## Verified

- `npm run typecheck`, `npm run lint`, `npm run lint:boundaries`, `npm run lint:embeds`, `npm run lint:migrations` — all clean.
- `npm run test` — 1299 unit tests across 96 files (13 new for feature-flags/audit-log, plus `sensitive-actions.test.ts`'s existing coverage test now passing against the new event).
- `npm run test:db` — 224 database tests, including the 4 new feature-flag RLS tests.
- `npm run build` — clean.
- `npm run test:e2e` — 256 passing.
- `npm run brand -- --check` / `npm run tracker -- --check` — current.
- No UI exists for platform-admin flag management or the audit-log viewer yet — like 16-006's AI operations monitoring before it, this ships as API-ready service functions rather than a screen, matching that precedent.

## Still open

- No `/platform-admin` UI screen calls either module yet (same precedent as 16-006's AI operations monitoring, which is also API-only today).
- `20-006` through `20-008` (billing abstraction, quota automation, plan experiments) are a natural next step that would reuse this same reason-coded, audited admin-action shape.
- `03-008`, `05-008`, `07-007`, `07-008`, `14-008` remain other open stories from this and prior activity.
