# HomeSend Phase 1: undo, audit trail, and a real upload security check

**Date:** 2026-09-22
**Area:** HomeSend (`packages/core/src/homesend/`, `apps/web/app/home-send/`)

## What was done

The Product Council PRD and Architecture Requirements docs approve HomeSend
as a full canonical-intake platform: email routing addresses, multi-file
attachments, a security pipeline, provenance, change sets/undo, PWA share
targets, and a governed cross-domain understanding pipeline, built in six
phases. This is Phase 1 — the foundation slice that is genuinely usable on
its own, reconciled with the HomeSend v1 (`home_send_items`, upload/paste →
classify → confirm → route) already shipped rather than replacing it.

Deliberately **not** built in this pass: `homesend_addresses` (email
routing), a normalized multi-attachment table, and the fuller
`RECEIVED → ... → APPLIED` lifecycle enum — none of those have a real
caller yet (email intake and multi-file upload are Phase 2+), and adding
the tables now would be schema nobody reads. Phase 1 instead ships three
things HomeSend's *existing* pipeline can use immediately:

1. **Undo.** Routing an item into a bill, school item or grocery item now
   records what it wrote (`homesend_changes`: one row per intake, the
   domain, and the entity id). A household can undo it from the same
   "Recently handled" list — an "Undo" pill replaces the "Added" badge on
   an unreversed routed item — and undo calls the exact domain service a
   manual remove would use (`cancelObligation` / `cancelSchoolItem` /
   `retireConsumable`), never a raw delete, per CLAUDE.md rule 12. The
   intake's own `status` gains a fifth value, `undone`, alongside `routed`
   — `routed_table`/`routed_id` are kept (never erased) so what actually
   happened stays on the record.
2. **A real audit trail.** HomeSend had none — five new `AUDIT_EVENTS`
   (`homesend.intake_received`, `.security_rejected`, `.applied`,
   `.dismissed`, `.undone`) are wired to the exact repository calls that
   cause them, registered in `sensitive-actions.ts`'s coverage catalogue
   (test-enforced — a declared event with no real emitter fails the
   build).
3. **Upload content actually matches its claimed type.** `home_send_items`
   gains `security_status` (`not_applicable` | `clean` | `rejected`). A
   manual upload's bytes are checked against a real magic-byte signature
   (`homesend/security.ts`) before classification — a mislabeled or
   renamed file is stored (the private bucket is the quarantine, per the
   architecture doc's "security failure → quarantine; no AI") but never
   read by a model, and the household sees "Couldn't be verified — you can
   still fill this in by hand" instead of a silent failure or a stuck
   spinner (CLAUDE.md rule 10: never a dead end).

## Where the code lives

- Migration: `supabase/migrations/20260922060000_homesend_changes_and_security.sql`
  — `home_send_items.security_status`, the widened `status`/
  `home_send_items_routed_implies_status` constraints, and the new
  `homesend_changes` table + RLS.
- `packages/core/src/homesend/security.ts` (new) — `detectImageMimeType`/
  `validateUploadSecurity`, pure and unit-tested
  (`security.test.ts`, 8 tests).
- `packages/core/src/homesend/changes.ts` (new) — `recordHomeSendChange`,
  `getHomeSendChange`, `listHomeSendChanges`, `undoHomeSendChange`.
- `packages/core/src/homesend/items.ts` / `repository.ts` — `securityStatus`
  on `HomeSendItem`, the `undone` status, `markHomeSendUndone`, audit calls
  in `createHomeSendItem`/`routeHomeSendItem`(via `changes.ts`)/
  `dismissHomeSendItem`.
- `packages/core/src/api/audit.ts` / `packages/core/src/security/sensitive-actions.ts`
  — the five new events, their catalogue entries and household-facing
  descriptions.
- `apps/web/app/(auth)/home-send-actions.ts` — the upload action now runs
  the security check before classifying; `routeHomeSendItemAction` records
  the change; new `undoHomeSendChangeAction`.
- `apps/web/app/_components/home-send-inbox.tsx` / `apps/web/app/home-send/page.tsx`
  — the Undo pill, the "Couldn't be verified" pending-item subtitle, and
  the `undone`/`routed`/`dismissed` badge split in "Recently handled".
- `scripts/test-homesend-rls.mjs` — 11 new DB tests: security_status
  defaults/constraint, one-change-per-intake, shared-inbox visibility and
  cross-household isolation on `homesend_changes`, the undo-consistency
  constraint, "any member can undo" and "can't undo twice" (using
  `deniedForUpdate`, not `deniedForProfile` — an already-undone row's
  `USING` clause silently matches zero rows rather than throwing), and "a
  member can't attribute an undo to someone else" (a `WITH CHECK` failure,
  which does throw).
- `scripts/verify-live-project.mjs` — added `home_send_items` and
  `homesend_changes` to `SHIPPED_TABLES` (neither had ever been added,
  a gap from the original HomeSend v1 session — caught and fixed here) and
  `home_send_items.security_status` to `SHIPPED_COLUMNS`.

## Verified

- `npm run verify` (typecheck, lint, lint:migrations, lint:embeds,
  lint:boundaries, lint:secrets, tracker --check, security, test, test:db,
  build, test:e2e) — all clean; 98 unit test files / 1357 tests (up from
  97/1344), 273 DB tests (up from 262 — 11 new), 260 E2E tests, 9/9
  security-suite areas.
- The migration applied to the live project (`kqxndableyysxqhxiorz`) via
  the Supabase MCP `apply_migration` tool in this session; `npm run
  verify:live` — 80/80 (added the two tables and the new column, and
  closed the pre-existing gap where `home_send_items` itself was never
  tracked).
- **Live browser verification** against a seeded QA household at 390px and
  1280px, driven end to end against the real live project (not a mock):
  pasted a bill-like message, confirmed it as a grocery item (no AI
  provider configured for this QA household, so the manual-fallback path
  ran — same as HomeSend v1's own verification), watched the "Undo" pill
  appear on the routed row, clicked it, and confirmed via direct SQL that
  the underlying `consumables` row was actually set `active = false`
  (not just the UI updating) and that `homesend_changes.undone_at`/
  `undone_by_member_id` were set. Also uploaded a plain-text file
  mislabeled `image/jpeg`: confirmed `security_status = 'rejected'`,
  confirmed no classification notice/AI call happened, and confirmed the
  "Couldn't be verified" subtitle rendered correctly in both "Needs your
  review" (pending) and after a full page reload. Read back the real
  `audit_events` rows for the whole sequence — `intake_received` →
  `security_rejected` (for the rejected upload), `intake_received` →
  `applied` → `undone` (for the routed-then-undone item) — confirming the
  audit trail is real, not just present in the schema.
- QA household and its auth user deleted afterward
  (`node scripts/qa-test-user.mjs delete`); the household's residual rows
  (items, changes, the retired consumable) are orphaned test data, same
  pattern prior QA sessions' notes describe.

## Still open (deliberately deferred to later phases)

- `homesend_addresses` (email routing), the Resend inbound-email webhook,
  and the wider `sourceType` enum (`email`/`system_share`/`voice_note`/
  `home_talk_attachment`/`native_share`) — Phase 2.
- Normalized multi-attachment storage, generalized classification schema
  (`HomeSendProposal`), cross-domain impact analysis, and semantic
  dedupe/conflict detection — Phase 3.
- PWA Web Share Target (`manifest.webmanifest`'s `share_target`, a
  `/api/v1/intake/share` endpoint, signed-out share handoff) — Phase 4.
- HomeSend address management UI, installation education prompts — Phase 5.
- Malware scanning (only a magic-byte check exists — no live scanning
  provider is configured, consistent with CLAUDE.md's external-providers
  rule), AI evaluation golden cases, retention/observability — Phase 6.
