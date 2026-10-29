# Data retention phase 2a: passed calendar events + purge dry-run

Stories 15-011. Follows phase 1 (15-010, PR #422). The owner answered the five
design questions (2026-10-28); their decisions are recorded in
`docs/data-retention.md` §9. This phase acts on Q1 (clean passed calendar
events on the retention window) and Q4 (enable the purge, but dry-run first).

## What was done

- **`family_events` cleanup.** Migration
  `20261028190000_data_retention_family_events.sql` adds a reversible
  `soft_deleted_at` to `family_events` with cleanup/purge partial indexes. The
  cleanup engine (`privacy/cleanup.ts`) gains a `family_events` spec:
  soft-delete events whose `ends_at` is older than the household window,
  **keeping** `protected` events, `birthday` and `appointment` kinds, and any
  recurring event (`recurrence is null` required). The spec filters are generic
  (`eq` / `isNull` / `notIn`), so later categories reuse them.
- **Reader filters.** `.is("soft_deleted_at", null)` added to the readers that
  could surface a hidden past event: the calendar range reads
  (`calendar/repository.ts`), the event detail page (`family/event-detail.ts`),
  the family event list (`family/repository.ts` `listEvents`), and the chat
  link-by-id (`chat/repository.ts`). Deliberately **not** added to the
  import-dedup read (`listImportedEvents`) — filtering it would let a hidden
  imported event be re-created on the next sync — nor to the reminder/notice
  source reads, which only read future/recent events and so never see a cleaned
  one (this is what makes cleanup resurrection-safe).
- **Purge dry-run (Q4).** `purgeSoftDeleted` now has three modes: `dryRun`
  (counts what it would delete, deletes nothing), `enabled` (really deletes),
  or no-op (the default). The nightly `/platform/retention` sweep runs it in
  **dry-run** and reports `wouldDelete` counts. Real deletion stays gated until
  the owner reviews a report — no irreversible purge runs on live.
- Design doc decisions (§9) and roadmap (§10, incl. the migration-ordering
  note), plus the module-15 backlog (15-011 Done, 15-013 and 15-012 queued).

## Migration ordering (important)

Unlike phase 1, the shipped reader code **reads** `soft_deleted_at`, so the
migration must be applied to live **before** the code deploys (a read against a
missing column errors). Because the Supabase MCP `apply_migration` times out in
cloud sessions, the owner runs the migration by hand first; this PR does **not**
auto-merge until that is confirmed.

## Verified

- `typecheck`, `lint:migrations` (191), `lint:knowledge`, `lint:boundaries`
  pass. ESLint passes on the changed route.
- vitest `packages/core/src/privacy/` — 66 pass (incl. the `family_events`
  eligibility/exclusions test and the purge dry-run test); `calendar`, `family`
  and `chat` suites still green (260 across the touched areas).
- A local Postgres 16 template built from all 191 migrations applies both
  retention migrations cleanly; the `soft_deleted_at` column and all six
  cleanup/purge indexes are present.
- `next build` and `check:bundle` pass.

## Open / needs a person

- **Apply `20261028190000_data_retention_family_events.sql` to live first**,
  then the PR may merge.
- **The purge dry-run report**: once soft-deleted rows have aged past the grace
  window, the nightly sweep's `purgeDryRun.wouldDelete` is the report the owner
  reviews before phase 2b flips the purge to real deletion.

## Where the code lives

`supabase/migrations/20261028190000_*.sql`;
`packages/core/src/privacy/cleanup.ts` (+ test);
`packages/core/src/calendar/repository.ts`,
`packages/core/src/family/{event-detail,repository}.ts`,
`packages/core/src/chat/repository.ts`;
`apps/web/app/api/v1/platform/retention/route.ts`; `docs/data-retention.md`.
