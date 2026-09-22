# Story 16-007: privacy request admin visibility and deletion fulfillment

**Date:** 2026-09-22
**Area:** `packages/core/src/privacy/fulfill-deletion.ts`, `packages/core/src/platform/privacy-requests.ts`, `apps/web/app/api/v1/platform-admin/privacy-requests/`, `apps/web/app/api/v1/platform/retention/route.ts`

## What was done

Story 16-007 ("Privacy requests — manage export/delete/consent workflows"),
the first P1 backlog story picked up after HomeSend's six phases closed.
Investigation (two research passes, documented in this session) found the
real, previously undocumented gap: `privacy_requests` (story 15-007) has
always recorded a deletion request and its 30-day grace window, but nothing
ever acted once that window passed — `purge.ts`'s own comment named it: "a
member's data goes when their deletion request matures, which is a
different job with different consequences and is not yet built." Deciding
what "delete a person's data" should actually do across the domain tables
that reference them (school items, chores, bills, meals, HomeSend, family
events) is exactly the kind of product/privacy decision CLAUDE.md carves
out as one to ask about rather than invent — asked, and the answer was:
scrub the member's own PII, keep the row and its references intact.

1. **`privacy/fulfill-deletion.ts`** (new) — `fulfillMaturedDeletions()`
   finds every `privacy_requests` row with `kind='deletion'`,
   `status='pending'`, `acts_at` in the past, and for each: deletes the
   member's avatar photo from Storage (best-effort), clears every PII
   field on their `household_members` row (`display_name` → "Removed
   member", `date_of_birth`/`nickname`/`relationship`/`occupation`/
   `school_or_work_location`/`special_occasion_label`/
   `special_occasion_date`/`avatar_path` → null, `profile_id` → null,
   `status` → `'inactive'`), drops their `household_roles`, marks the
   request `completed`, and writes a `privacy.deletion_fulfilled` audit
   event. Deliberately does **not** touch any other domain table: a
   `household_members` row is never hard-deleted (matches
   `deactivateMember`'s existing design), so every other table's
   `member_id` reference keeps resolving to the same row, now carrying an
   anonymized name automatically — and free-text content the household
   itself wrote (a chore's notes, a meal's description) is exactly what
   `purge.ts` already refuses to touch on a timer, for the same reason. A
   person's platform account (`profiles`/`auth.users`) is untouched too —
   `privacy_requests` is household-scoped, and the same profile could
   belong to another household; only `household_members.profile_id`
   detaches.
2. **`platform/privacy-requests.ts`** (new) — `listPlatformPrivacyRequests`
   and `refusePrivacyRequest`, the platform-admin read/refuse surface
   `privacy_requests` has never had (no RLS policy ever granted staff
   reach; only the household's own session could see a request). Gated on
   a new `privacy_requests.manage` capability, `operator`/`owner` only —
   the same boundary `feature_flags.manage` already draws. Refusing writes
   `status='refused'`/`refusal_reason`, columns the schema has supported
   since 15-007 with nothing ever writing either.
3. **Two new routes**, matching the existing platform-admin shape (no
   `/platform-admin` UI page exists anywhere in this app — confirmed by
   investigation that the entire module is API-only, so none was added
   here either, consistent with 16-005/16-006/16-008's own precedent):
   `GET /platform-admin/privacy-requests` (filterable by `status`, `kind`,
   `householdId`) and `PATCH /platform-admin/privacy-requests/{requestId}`
   (refuse, with a reason).
4. **Wired into `/platform/retention`** — the same cron-secured sweep
   `purgeExpired` and `pruneExpiredShareHandoffs` already run from. Not
   folded into `purge.ts`'s `PURGE_TARGETS` map: that map is an age-cutoff
   pattern (delete rows older than N days), and a matured deletion acts on
   its own `acts_at`, not a row's age — a different shape, so its own
   function, called alongside the others. The route's response now reports
   `deletionsFulfilled`/`deletionsFailed`.
5. Two new audit event types (`privacy.deletion_fulfilled`,
   `privacy.request_refused`), OpenAPI documentation for both new routes.

## Verified

- `npm run verify` clean end to end — typecheck, every lint gate, the P0
  security suite, the full unit suite (new: `fulfill-deletion.test.ts` (8
  tests, fake-client), `privacy-requests.test.ts` (8 tests, fake-client),
  an `admin.test.ts` capability-matrix addition), `test:db` (+7 new tests
  in `test-privacy-requests-rls.mjs` — `privacy_requests` had carried its
  RLS policies since 15-007 with no DB test file of its own until now),
  `build`, full `test:e2e` (the new routes are auto-discovered and swept
  for anonymous-caller refusal by `e2e/domains.spec.ts`'s filesystem scan,
  same as every other route).
- No migration — every field `fulfillMaturedDeletions` touches already
  existed; nothing here changes the schema. `npm run verify:live` — 84/84,
  unchanged, confirming nothing regressed.
- **Live verification against the real deployment and real database**: a
  throwaway QA household with two adult members (one with a full set of
  extended profile fields and a real avatar path) plus a QA
  `platform_admins` row (`operator`). Staged a real, already-matured
  deletion request via direct SQL, started the dev server against the live
  project with a real `CRON_SECRET`, and called
  `POST /platform-admin/retention`: `deletionsFulfilled: 1`. Confirmed via
  SQL that the member's row was genuinely scrubbed
  (`display_name: "Removed member"`, every PII field null, `profile_id`
  detached, `status: "inactive"`) and the request completed. Signed in as
  the QA platform admin (real cookies, via Playwright) and called
  `GET /platform-admin/privacy-requests` (both filtered and unfiltered —
  correct results) and `PATCH .../{requestId}` to refuse a second staged
  request — `200`, confirmed the row's `status`/`refusal_reason` and the
  `privacy.request_refused` audit event afterward. All QA data (household,
  members, requests, audit events, the platform-admin grant, both auth
  accounts) deleted afterward; dev server stopped.

## Still open

- **Consent.** The backlog's "export/delete/**consent**" goal is not
  reflected in `privacy_requests` at all — its `kind` check constraint
  only allows `export`/`deletion`. A separate AI-consent concept already
  exists (`ai/privacy.ts`), a household-level toggle, not a per-request
  workflow and not part of this table. No new consent-request type was
  added here; if the backlog genuinely wants one, that is its own,
  separate scoping question.
- No `/platform-admin` UI page was built for this (or any other) platform
  capability — matches this module's existing precedent everywhere else,
  not a gap specific to this story.

## Where the code lives

- `packages/core/src/privacy/fulfill-deletion.ts` (+ `.test.ts`)
- `packages/core/src/platform/privacy-requests.ts` (+ `.test.ts`)
- `packages/core/src/platform/admin.ts` (`privacy_requests.manage` capability)
- `packages/core/src/api/audit.ts` (two new event types)
- `packages/core/src/privacy/purge.ts` (updated doc comment)
- `apps/web/app/api/v1/platform-admin/privacy-requests/route.ts`
- `apps/web/app/api/v1/platform-admin/privacy-requests/[requestId]/route.ts`
- `apps/web/app/api/v1/platform/retention/route.ts` (wired in)
- `packages/core/src/api/openapi.ts`
- `scripts/test-privacy-requests-rls.mjs` (new)
