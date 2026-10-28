# Data retention: periodic cleanup framework (phase 1)

Story 15-010. The owner asked (2026-10-28) for jobs that periodically clean up
entries that exist only so a household doesn't forget an upcoming thing, once
they have passed — to reduce load and avoid keeping non-required personal
information. Design-first and phased.

## What was done

- **Design doc** `docs/data-retention.md`: the retention model built on the
  existing `privacy/retention.ts` system, the soft-delete → grace → purge
  lifecycle, per-category targets and exemptions with reasons, the Admin
  setting, the job schedule and idempotency, references-safety, children's
  privacy, the counts-only audit, the seven guardrails, a phased roadmap, and
  **five open questions for the owner** (Q1 passed events ephemera-vs-keepsake,
  Q2 financial history, Q3 children's school history, Q4 when hard purge may
  run on live, Q5 notifications).
- **Migration** `supabase/migrations/20261028180000_data_retention_cleanup.sql`
  (additive, safe in either order): a reversible `soft_deleted_at` column on
  `availability_exceptions` and `family_event_changes` with partial indexes for
  the cleanup and (gated) purge scans; and `retention_cleanup_runs`, a
  counts-only audit table, admin-read (set-form RLS), server-write only.
- **Window setting** `packages/core/src/privacy/retention-window-repository.ts`:
  stored as a versioned `policies` row (category `privacy`), Admin-only,
  default 90 days, 7-day floor, "off" supported; fails to the safe side (keep).
- **Cleanup engine** `packages/core/src/privacy/cleanup.ts`: per-household
  window, bounded, idempotent, failure-isolated; soft-delete only. Enabled
  specs: `availability_exceptions`, `family_event_changes`. The irreversible
  `purgeSoftDeleted` is written for a complete, testable lifecycle but **gated
  off** (`RETENTION_PURGE_ENABLED = false`) and not wired into the live sweep
  (guardrail G7).
- **Wiring**: `runRetentionCleanup` runs on the nightly
  `/api/v1/platform/retention` sweep (where `purgeExpired` already lives), not
  the 5-minute delivery clock — day-scale housekeeping, no new Hobby-tier cron.
- **Settings UI**: the retention window is an Admin-picked control in the
  Privacy Centre (`/settings/privacy`), mirroring the auto-add percent picker
  (`retention-window-picker.tsx`, `saveRetentionWindowAction`), with labels in
  all eight languages and a new privacy help paragraph (`body.5`, `updated`
  bumped) in all eight.
- **Registry**: `retention_cleanup_runs` registered `excluded` in
  `knowledge/registry.ts`.

## Why these categories, and not the owner's headline yet

The reminder/notice readers of the candidate tables are already time-windowed
to recent/future rows, so a row old enough to clean is outside every reminder
source's window — cleaning it cannot orphan a row or regenerate a stray
reminder (design §6). `availability_exceptions` (no inbound FKs) and
`family_event_changes` (server-only, no readers) are therefore provably safe
with no reader changes, which also keeps the migration safe in either order.
Passed **calendar events** (the owner's headline), **school items**, and
**HomeSend** need `soft_deleted_at` filters threaded through many readers (≈18
for events) — and PR #419 is actively editing event/HomeSend/school reads — so
they are fully specified and staged to phase 2/3 (stories 15-011, 15-012)
pending the owner's answers to Q1/Q3/Q4, rather than shipped as a half-wired
privacy filter now.

## Verified

- `lint:migrations` (190), `lint:knowledge`, `lint:boundaries`, `lint:embeds`,
  `lint:help-links` pass.
- `typecheck` passes. ESLint passes on the changed `apps/web` files.
- vitest `packages/core/src/privacy/` — 64 pass (cleanup: targets vs exemptions,
  window boundary, idempotency, off/skip, fail-safe, gated-purge no-op and
  enabled-purge; window repository: parse/load/save/fail-safe).
- A new DB RLS test (`scripts/test-retention-cleanup-rls.mjs`) and the
  per-row-helper meta-test (`test-setup-counts-rls.mjs`) pass on a local
  Postgres 16 cluster built from all 190 migrations — which also proves the
  migration applies cleanly.
- `next build` and `check:bundle` pass (no help/server words in client JS).

## Open / needs a person

- The **five questions** in `docs/data-retention.md` §9 gate phases 2–3. Phase
  1 does not depend on them.
- **The migration must be applied to the live project** (additive). Phase 1's
  code does not reference the new column from any reader, so it is safe whether
  or not the migration has been applied when the deploy goes live.

## Where the code lives

`docs/data-retention.md`; `supabase/migrations/20261028180000_*.sql`;
`packages/core/src/privacy/{cleanup,retention-window-repository}.ts` (+ tests);
`apps/web/app/api/v1/platform/retention/route.ts`;
`apps/web/app/_components/retention-window-picker.tsx`;
`apps/web/app/(auth)/consent-actions.ts`;
`apps/web/app/settings/privacy/page.tsx`;
`apps/web/app/_lib/settings-labels.ts`; `scripts/test-retention-cleanup-rls.mjs`.
