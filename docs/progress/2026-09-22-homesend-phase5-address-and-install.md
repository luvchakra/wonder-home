# HomeSend Phase 5: email address management and an install nudge

**Date:** 2026-09-22
**Area:** HomeSend (`apps/web/app/_components/home-send-channels.tsx`, `apps/web/app/(auth)/homesend-address-actions.ts`)

## What was done

Phase 5 of the approved HomeSend architecture, scoped to the two items the
plan named: a UI for Phase 2's already-real `homesend_addresses` backend
(create/rotate/revoke existed with real RLS and audit events since Phase 2,
with no screen ever calling them), and an install nudge explaining why
installing the app matters now that Phase 4 makes it a real Web Share
Target. No new migration — this phase is entirely UI and server actions
over schema that already shipped and was already DB-tested.

1. **`HomeSendChannels`** (new component, rendered on `/home-send` below
   the drop zone and review queue — setup, done once, doesn't compete with
   the primary "send something in" flow per CLAUDE.md rule 17) — a new
   "Other ways to send things in" section with two cards:
   - **Email**: shows the household's address (read-only field + copy
     button) once one exists; every member can read and copy it, only an
     admin sees the create/rotate/revoke controls
     (`homesend-address-actions.ts`, each backed by
     `requireHouseholdAdmin` on top of the RLS 42501 `addresses.ts`
     already enforces). A revoked address offers "Turn back on" (reuses
     `rotateHomeSendAddress`, which already resets status to active with
     a fresh address — no new repository function needed). When
     `platformHomeSendEmailDomain()` returns null (still genuinely
     unconfigured in this environment), the whole email card is omitted
     rather than showing a button with nowhere to go (CLAUDE.md rule 10)
     — a non-admin with no address sees "Ask an admin to set this up"
     instead of nothing, so the empty state still answers "why isn't
     there anything here."
   - **Install**: reuses `useInstallPrompt`/`installInstructions` (the
     hook the avatar menu's own "Install app" entry already uses,
     `packages/core/src/pwa/use-install-prompt.ts`) with page-specific
     copy explaining that installing is what makes the phone's own share
     button reach HomeSend directly — hidden once already installed.
     Needed a new `"./pwa/*"` entry in `packages/core/package.json`'s
     export map, since `use-install-prompt.ts` had only ever been
     imported from inside the same package before.

## Verified

- `npm run verify` clean end to end — typecheck, every lint gate, the P0
  security suite (9/9), the full unit suite, `test:db` (294 tests,
  unchanged — no schema touched this phase), `build`, full `test:e2e`
  (264 tests, unchanged — no new API routes, only server actions and UI).
- `npm run verify:live` — 83/83, unchanged, confirming nothing regressed
  (no migration to apply this phase).
- **Live verification against the real deployment and real database**:
  created a throwaway QA household, and — since
  `WONDERHOME_HOMESEND_EMAIL_DOMAIN` is genuinely unset in this
  environment, the same honest gap every prior phase has documented —
  started the dev server once with that variable set to a placeholder
  domain (no real credential, just an internal string that unlocks the
  already-tested address-generation code path, the same spirit as Phase
  2's deliberately fake Resend key) to exercise the full admin flow for
  real: clicked "Set up email forwarding" and confirmed a real
  `homesend_addresses` row appeared; copied the address and confirmed the
  clipboard held the exact value; clicked "Get a new address" and
  confirmed via direct SQL that `rotated_at` was set and the address
  actually changed; clicked "Turn off" and confirmed `status='revoked'`
  and `revoked_at` set, with the UI correctly showing "Turned off" and
  "Turn back on"; confirmed the audit trail's `homesend.address_created`/
  `.address_rotated`/`.address_revoked` events fire (already
  test-enforced since Phase 2, exercised live here for the first time).
  Also confirmed the Install card and its instructions sheet render
  correctly, and that scrolling to the true bottom of the page shows the
  address card, install card and closing `QuoteCard` fully clear of the
  fixed tab bar (a mid-scroll screenshot briefly looked like an overlap —
  confirmed to be a scroll-position artifact, not a real clearance bug,
  by checking the fully-scrolled state). QA household and test user
  deleted afterward; the dev server was not left running with the
  placeholder domain set.

## Still open

- Phase 6 (hardening: malware scanning beyond the magic-byte check, AI
  evaluation golden cases, rate limiting, retention/observability) is the
  last phase in the architecture doc's own order.
- Real email forwarding is still not live in production — this phase
  ships the UI for it, not the credential. `WONDERHOME_HOMESEND_EMAIL_DOMAIN`
  and Resend's `RESEND_API_KEY`/`RESEND_WEBHOOK_SECRET` (Phase 2) both
  remain a human's errand.

## Where the code lives

- `apps/web/app/_components/home-send-channels.tsx`
- `apps/web/app/(auth)/homesend-address-actions.ts`
- `apps/web/app/home-send/page.tsx` (wiring: `getHomeSendAddress`,
  `platformHomeSendEmailDomain`, `isHouseholdAdmin`)
- `packages/core/package.json` (`./pwa/*` export)
