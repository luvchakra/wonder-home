# HomeSend Phase 6: hardening

**Date:** 2026-09-22
**Area:** HomeSend (`packages/core/src/homesend/`, `packages/core/src/ai/classify-intake.ts`, `apps/web/app/api/v1/intake/share/route.ts`, `apps/web/app/api/v1/platform/retention/route.ts`)

## What was done

Phase 6, the last phase in the approved HomeSend architecture's own order.
Four pieces, each closing a real, previously-undocumented gap rather than
adding a new feature:

1. **Malware-scanning seam** (`homesend/malware-scan.ts`, new). The
   magic-byte check in `homesend/security.ts` (`detectImageMimeType`) has
   always proven a file's bytes actually are the image format it claims to
   be — it was never a malware scanner, and said so in its own doc comment.
   `scanForMalware`/`platformMalwareScanConfig` are the provider-neutral
   seam that closes that gap the same way `ai/model-key.ts` and
   `voice/platform-key.ts` already do: POST the bytes to whatever endpoint
   `WONDERHOME_MALWARE_SCAN_ENDPOINT` names, get back `{ clean: boolean }`,
   dependency-injected `fetch` for testability. No scanning provider is
   configured anywhere in this repo (confirmed no local binary like
   ClamAV is available in this environment either), so it resolves to
   `{ scanned: false }` on every call today — genuinely inert, never
   claiming a live integration, exactly as CLAUDE.md requires. Wired into
   `security.ts`'s new `assessUploadSecurity()` (async, wraps the existing
   synchronous `validateUploadSecurity` with the scan result) and from
   there into all three upload call sites: the paperclip's
   `home-send-actions.ts`, the Web Share Target's `intake/share/route.ts`,
   and the share-handoff resume path in `home-send/page.tsx`.
2. **AI evaluation golden cases for the classifier** (`ai/classify-intake-evaluations.ts` + its `.test.ts`, new). `classifyIntake()` itself
   calls a live model, so — following the same discipline `evaluations.ts`
   already documents for the conversation engine ("a consequential
   decision is decided outside the LLM, and evaluated against that policy")
   — nothing here calls one either. What's genuinely testable and worth
   testing is a real gap: a schema-valid structured response can still be
   internally inconsistent (a `grocery_item` with a `billKind` set, a
   `secondary` proposal on `unknown`) if a model doesn't follow its own
   system-prompt instructions, and nothing in code enforced those
   cross-field invariants before this. `sanitizeIntakeExtraction()` is
   that deterministic backstop — nulls out any field the claimed `kind`
   doesn't own, collapses unreadable content to a bare `unknown` — and it
   now runs on every provider's output before `classifyIntake` returns.
   Eight golden scenarios in `classify-intake-evaluations.ts` cover it:
   clean bill/school/grocery extractions passing through untouched,
   hallucinated fields on the wrong kind getting stripped, a legitimate
   `secondary` proposal on a school item surviving, and unreadable content
   collapsing correctly.
3. **Rate limiting on the anonymous share handoff**
   (`homesend/rate-limit.ts`, new; `homesend/share-handoff.ts` extended;
   migration `20260922110000_homesend_share_handoff_rate_limit.sql`).
   `POST /api/v1/intake/share`'s signed-out branch is the one genuinely
   anonymous write in the entire HomeSend pipeline — no membership check,
   writes a real row every time, reachable by anyone whose OS share sheet
   lands there. `ip_hash` (a new nullable column, never the raw address —
   only its sha256 via `hashClientIp`) lets the route count how many
   handoffs one caller has staged in the last 15 minutes
   (`countRecentShareHandoffs`) and refuse past 10
   (`mayCreateShareHandoff`, pure, mirrors `security/step-up.ts`'s
   `mayAttempt` shape) — redirects to `/home-send?shareError=rate_limited`
   with a plain-language message. An unidentifiable caller (no
   `x-forwarded-for`/`x-real-ip` at all, only really possible without a
   proxy in front of the app) is let through rather than blocked: this is
   a throttle against abuse, not an authorization gate, and a genuine
   share should never be refused just because the route couldn't name who
   sent it.
4. **Retention/observability**. `pruneExpiredShareHandoffs` (previously
   fire-and-forget, called only opportunistically from the share route
   itself) now returns a count and throws on a real failure. It's called
   from the same two places as before, but `/platform/retention`'s real
   sweep now also calls it directly — closing a genuine gap where a
   household that shared once, signed out, and never shared again would
   have left its one expired row behind forever, with no sweep covering
   it. Deliberately not folded into the day-scale `RetentionClass`
   framework the rest of `/platform/retention` runs off: a staged share
   has a fixed 30-minute window, not a published day-scale policy, and
   nobody has an account yet when it's staged, so it isn't "their" data in
   the Privacy Centre's sense — reasoning documented inline in both
   `share-handoff.ts` and the retention route. The route's response now
   reports `handoffsDeleted` alongside the existing per-table sweep
   outcomes, and returns 207 if either sweep hit an error.

## Verified

- `npm run verify` clean end to end — typecheck, every lint gate
  (including the new migration against `lint-migrations`), the P0
  security suite, the full unit suite (108 new assertions across
  `malware-scan.test.ts`, the extended `security.test.ts`,
  `classify-intake-evaluations.test.ts`, and `rate-limit.test.ts`),
  `test:db` (296 tests, +2 for the new `ip_hash` column), `build`, full
  `test:e2e`.
- New migration applied live via Supabase MCP `apply_migration`, confirmed
  with `npm run verify:live`.
- Live verification: exercised the share target's rate limit against the
  real deployment by sending more than the threshold's worth of anonymous
  share POSTs from one IP and confirming the real `homesend_share_handoffs`
  table stopped gaining rows for that caller past the limit, then confirmed
  a normal share from a different caller still succeeded; confirmed
  `POST /api/v1/platform/retention` (with the real `CRON_SECRET`) reports
  `handoffsDeleted` and that an intentionally-expired test row was actually
  gone afterward.

## Still open

- No malware-scanning provider is configured — `WONDERHOME_MALWARE_SCAN_ENDPOINT` remains unset, same honest gap as every other
  provider-neutral seam in this repo (a human's vendor/credential errand,
  not something to invent).
- Real email forwarding (`RESEND_API_KEY`/`RESEND_WEBHOOK_SECRET`,
  `WONDERHOME_HOMESEND_EMAIL_DOMAIN`) and WhatsApp both remain unbuilt/
  uncredentialed, as documented since Phase 2/5.
- This closes the HomeSend architecture doc's own six-phase order. Next
  work falls back to the repo's general dependency-ready-story process
  (`tracking/PROGRESS.md`/`tracking/IMPLEMENTATION-ORDER.md`) rather than
  a further HomeSend-specific phase.

## Where the code lives

- `packages/core/src/homesend/malware-scan.ts` (+ `.test.ts`)
- `packages/core/src/homesend/rate-limit.ts` (+ `.test.ts`)
- `packages/core/src/homesend/security.ts` (`assessUploadSecurity`, extended `.test.ts`)
- `packages/core/src/homesend/share-handoff.ts` (`countRecentShareHandoffs`, `pruneExpiredShareHandoffs` now returns a count)
- `packages/core/src/ai/classify-intake.ts` (`sanitizeIntakeExtraction`)
- `packages/core/src/ai/classify-intake-evaluations.ts` (+ `.test.ts`)
- `apps/web/app/api/v1/intake/share/route.ts` (rate limit + `assessUploadSecurity` wiring)
- `apps/web/app/api/v1/platform/retention/route.ts` (handoff sweep)
- `apps/web/app/(auth)/home-send-actions.ts`, `apps/web/app/home-send/page.tsx` (`assessUploadSecurity` wiring)
- `supabase/migrations/20260922110000_homesend_share_handoff_rate_limit.sql`
- `scripts/test-homesend-rls.mjs` (new `ip_hash` DB tests)
