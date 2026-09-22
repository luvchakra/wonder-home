# HomeSend Phase 4: the PWA Web Share Target and its signed-out handoff

**Date:** 2026-09-22
**Area:** HomeSend (`packages/core/src/homesend/`, `apps/web/app/api/v1/intake/share/`, `apps/web/public/manifest.webmanifest`)

## What was done

Phase 4 of the approved HomeSend architecture: installed as a PWA, WonderHome
is now a real target in the OS share sheet — sharing a photo, a link or a
forwarded message from any other app lands directly in HomeSend's review
queue, whether or not the person has ever signed in on that device.

1. **`manifest.webmanifest` gained `share_target`** (Web Share Target Level
   2: `action`, `method: "POST"`, `enctype: "multipart/form-data"`,
   `params` for `title`/`text`/`url` and one `files` entry for a photo,
   restricted to the same JPEG/PNG/WebP types uploads already require).
2. **`POST /api/v1/intake/share`** — the landing point, a real full-page
   form POST from the OS, not a fetch call, so it bypasses `defineRoute`
   (same reason the email webhook does: it needs the raw multipart body,
   and it always ends in a redirect, Post/Redirect/Get, never a JSON
   envelope). Deliberately public — `e2e/domains.spec.ts`'s anonymous-
   caller sweep is told so via a new `PUBLIC_PATHS` entry, since being
   reachable without a session is the entire point.
   - **Signed in with a household**: classifies and saves the shared
     content immediately (`classify-and-save.ts`, extracted from
     `home-send-actions.ts` so upload/paste/share all share the one
     "never guess, never throw" path), then redirects to `/home-send`.
   - **Signed out** (or signed in with no household yet — a rare
     mid-onboarding edge deliberately not given its own handoff path):
     stages the content in a new `homesend_share_handoffs` table (no
     `household_id` — none is known yet) behind an unguessable token, and
     redirects to `/sign-in?next=/home-send?handoff=<token>`. `/home-send`
     resumes it the moment sign-in resolves a real household, then
     redirects to the clean URL so a reload never tries the same
     (already-deleted) token twice.
3. **`homesend_share_handoffs`** is the one table in this schema with no
   `household_id` and no RLS grant to any session at all — not even the
   admin who will eventually own the content. The unguessable token is its
   only credential, exactly like `homesend_addresses`' own token, taken
   all the way: only the server's admin client, which bypasses RLS, ever
   reads or writes it. A single always-false `select` policy exists purely
   so the table isn't "no policy at all" (`scripts/test-tenant-isolation-
   rls.mjs` treats that as unprotected) — the same shape `audit_events`
   already uses for a table that's real, RLS-enabled, and still correctly
   unreachable from every session. Both `NON_TENANT_TABLES` allowlists
   (`lint-migration-schema.mjs`, `test-tenant-isolation-rls.mjs`) list it
   with that reason. Rows expire in 30 minutes and are pruned
   opportunistically on every share POST — cheap enough that no cron is
   needed yet.
4. An invalid share (wrong file type, oversized file) redirects to
   `/home-send?shareError=<reason>` when signed in, which now renders an
   `Alert` explaining what happened — never a silent drop.

## Verified

- `npm run verify` clean end to end — typecheck, every lint gate, the P0
  security suite (9/9), the full unit suite, `test:db` (294 tests,
  including 6 new for `homesend_share_handoffs`: staged-and-read-back,
  no signed-in caller of any privilege can read it, the kind/content CHECK
  constraint both directions, a token can't be reused), `build`, and the
  full `test:e2e` suite (264 tests — `/intake/share` correctly drops out
  of the anonymous-401 sweep via `PUBLIC_PATHS` with no other count
  change, since it was never counted twice).
- Migration applied live to the `wonderhome` Supabase project via the
  Supabase MCP `apply_migration` tool; confirmed with `npm run verify:live`
  (83/83 checks).
- **Live verification against the real deployment and real database**,
  end to end, no mocks: served `manifest.webmanifest` and confirmed
  `share_target` renders correctly; POSTed genuine multipart form data to
  `/api/v1/intake/share` with no session and confirmed a 303 to
  `/sign-in?next=...` plus a real `homesend_share_handoffs` row with the
  combined title/text; created a throwaway QA household, POSTed the same
  share authenticated and confirmed a 303 to `/home-send` plus a real
  `home_send_items` row under the real household and member; visited
  `/home-send?handoff=<token>` signed in and confirmed the earlier
  anonymous handoff was consumed (token row deleted — confirmed via SQL)
  and a second real `home_send_items` row appeared; screenshotted
  `/home-send` at 390px showing both pending items correctly in "Needs
  your review"; POSTed a mislabeled text file as a photo and confirmed the
  `shareError=type` redirect renders the `Alert` correctly. QA household
  (cascade-deleted everything) and QA auth user deleted afterward.
- `CLAUDE.md`'s HomeSend paragraph updated to name Phase 3's secondary
  proposal and Phase 4's share target as real, alongside the existing
  email-webhook description.

## Still open

- Phase 5 (HomeSend UX — the address-management screen for Phase 2's
  already-real backend, installation-education prompts) and Phase 6
  (hardening: malware scanning beyond the magic-byte check, AI evaluation
  golden cases, rate limiting, retention/observability) remain, per the
  architecture doc's own phase order.
- No platform AI provider key is configured in this environment, so every
  live-verified share in this session fell back to "no AI provider set up"
  manual entry — the same already-documented gap from every prior
  HomeSend phase. The share endpoint's own save/classify/redirect
  plumbing is fully verified; the classifier itself is unit-tested against
  fixtures only.
- A signed-in visitor sharing before they've created a household
  (mid-onboarding) is an acknowledged, deliberately unhandled edge —
  `/welcome` has no "resume after" step to hand a token to.

## Where the code lives

- `apps/web/public/manifest.webmanifest`
- `apps/web/app/api/v1/intake/share/route.ts`
- `apps/web/app/home-send/page.tsx` (the handoff resume + `shareError` Alert)
- `packages/core/src/homesend/share-handoff.ts`
- `packages/core/src/homesend/classify-and-save.ts` (extracted, shared by upload/paste/share)
- `supabase/migrations/20260922100000_homesend_share_handoff.sql`
- `packages/core/src/api/openapi.ts`, `e2e/domains.spec.ts` (`PUBLIC_PATHS`)
- `scripts/lint-migration-schema.mjs`, `scripts/test-tenant-isolation-rls.mjs` (`NON_TENANT_TABLES`)
- `scripts/test-homesend-rls.mjs` (6 new tests, 42 total)
- `scripts/verify-live-project.mjs`
