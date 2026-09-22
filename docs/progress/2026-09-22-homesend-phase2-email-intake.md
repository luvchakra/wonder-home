# HomeSend Phase 2: the email intake channel

**Date:** 2026-09-22
**Area:** HomeSend (`packages/core/src/homesend/`, `apps/web/app/api/v1/homesend/`)

## What was done

Phase 2 of the approved HomeSend architecture: a household can now forward
an email to its own HomeSend address and have it enter the same
classify → confirm → route pipeline Phase 1's upload/paste path already
uses. Scoped deliberately to text-only email (no attachment fetch/storage
yet — that needs the multi-attachment table Phase 3 owns) and to the
backend (no address-management UI yet — that is explicitly Phase 5 in the
architecture doc's own phase split), so nothing shipped here is a feature
with no way to reach it and nothing here duplicates work a later phase
already owns.

1. **`homesend_addresses`** — one routing address per household
   (`hs-<random-token>@<platform domain>`), admin-managed (create/rotate/
   revoke, all audited, same shape as the household's own AI key). The
   plaintext address is stored, not hashed — unlike an invitation token it
   must be redisplayed repeatedly (copy/share), so its defense is its own
   unguessable randomness, not secrecy against a database read. No UI calls
   these functions yet; Phase 5 wires the address-management screen to
   them, but the repository layer, RLS and tests are real and complete now.
2. **A real Resend inbound-email gateway**, behind a provider-neutral seam
   (`homesend/email-gateway.ts`) exactly like the AI/voice providers:
   `platformResendConfig()` returns `null` until a deployment sets
   `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` — genuinely unconfigured in
   this repo, since a Resend account and a verified receiving domain are a
   human's errand (DNS records, domain ownership) this session cannot
   create. Two real, documented network facts drove the shape (confirmed
   against Resend's current docs, not assumed): the `email.received`
   webhook carries only metadata — "webhooks do not include the email
   body, headers, or attachments" — so reading the actual message needs a
   second authenticated call (`fetchReceivedEmail`); and signatures are
   Svix-format (`svix-id`/`svix-timestamp`/`svix-signature`, HMAC-SHA256
   over `${id}.${timestamp}.${rawBody}`), implemented directly with
   `node:crypto` rather than a new dependency.
3. **`POST /api/v1/homesend/email/webhook`** — provider-authenticated, not
   session-authenticated: reads the raw body first (verification needs the
   exact bytes, never a re-parsed one), verifies the signature, resolves
   the household from the recipient address server-side (never from the
   payload), fetches the real email content, and feeds it into the exact
   same `createEmailHomeSendItem` → classify → (existing) confirm/route UI
   pipeline. Idempotent by construction: `(household_id, external_id)` has
   a real unique index, and a re-delivered webhook upserts into the same
   row rather than creating a second one. Both "not configured" and "bad
   signature" answer with the identical 401 envelope
   `/platform/retention` already established for this exact situation
   (secret-authenticated, not session-authenticated) — deliberately
   indistinguishable from outside, and what keeps the endpoint passing
   `e2e/domains.spec.ts`'s "every endpoint refuses an anonymous caller the
   same way" sweep without a special case.
4. **`home_send_items` widened for a source with no acting member**:
   `source` gains `'email'`, `external_id` (idempotency key) and
   `sender_address` (real, used in the audit trail) are new columns, and
   `created_by_member_id` becomes nullable — nobody in the household typed
   this in. A new constraint (`home_send_items_actor_matches_source`)
   keeps the two facts locked together at the database level: email always
   has no member, everything else always does.
5. **Three new audit events** — `homesend.address_created/rotated/revoked`
   — registered the same way Phase 1's five were (`AUDIT_EVENTS`,
   `sensitive-actions.ts`'s test-enforced catalogue, `describeAuditEvent`).
   `homesend.intake_received`/`.applied` already fire correctly for an
   email-sourced item since `createEmailHomeSendItem` and
   `recordHomeSendChange` are the same repository functions Phase 1 built.

## Where the code lives

- Migration: `supabase/migrations/20260922080000_homesend_email_intake.sql`.
- `packages/core/src/homesend/email-gateway.ts` (new) — signature
  verification, envelope parsing, the Resend API client, all pure/
  injectable and unit-tested (`email-gateway.test.ts`, 15 tests including
  a genuinely valid HMAC constructed and verified round-trip).
- `packages/core/src/homesend/addresses.ts` (new) — address generation,
  CRUD, and `resolveHouseholdIdByAddress` (the webhook's own lookup,
  always the admin client). Unit-tested (`addresses.test.ts`, 5 tests).
- `packages/core/src/homesend/repository.ts` — `createEmailHomeSendItem`
  (idempotent upsert), `fromRow`/`SELECT_COLUMNS` widened.
- `packages/core/src/homesend/items.ts` — `HomeSendItem.createdByMemberId`
  is now `string | null`; new `externalId`/`senderAddress` fields;
  `HomeSendAddress` type.
- `apps/web/app/api/v1/homesend/email/webhook/route.ts` (new) — the
  webhook handler; a small local `classifyEmailIntake` (deliberately not
  shared with `home-send-actions.ts`'s `classifyAndSave` — different
  context, no session, always the admin client, and generalizing would
  cost more than the dozen duplicated lines it saves).
- `packages/core/src/api/openapi.ts` — documents the new endpoint.
- `packages/core/src/api/audit.ts` / `packages/core/src/security/sensitive-actions.ts`
  — the three new address events.
- `scripts/test-homesend-rls.mjs` — 12 new DB tests: the nullable-actor/
  source constraint both directions, external_id idempotency (same id
  twice in one household fails, same id in a different household is
  fine), `homesend_addresses` RLS (member read, admin-only write,
  one-per-household, cross-household isolation) and the exact "does a
  revoked address resolve" query the webhook makes.
- `scripts/verify-live-project.mjs` — `homesend_addresses` added to
  `SHIPPED_TABLES`, `home_send_items.external_id` to `SHIPPED_COLUMNS`.

## Verified

- `npm run verify` (typecheck, lint, lint:migrations, lint:embeds,
  lint:boundaries, lint:secrets, tracker, security, test, test:db, build,
  test:e2e) — all clean; 100 unit test files / 1380 tests (up from
  98/1357), 285 DB tests (up from 273 — 12 new), 264 E2E tests (up from
  260 — the new endpoint's own anonymous-caller sweep, ×2 viewports), 9/9
  security-suite areas.
- Caught and fixed two real bugs during DB testing before they reached the
  live project: the pre-existing `home_send_items_has_content` constraint
  didn't recognize `'email'` as a valid source at all (an email-sourced
  row with real text would have been rejected outright — fixed by
  widening it alongside `pasted_text`), and an RLS test used
  `deniedForProfile` for an UPDATE where the correct tool was
  `deniedForUpdate` (the documented "a denied UPDATE silently matches zero
  rows rather than throwing" gotcha) — it was reporting a false pass.
- The migration applied to the live project (`kqxndableyysxqhxiorz`) via
  the Supabase MCP `apply_migration` tool in this session; `npm run
  verify:live` — 82/82.
- **Live verification against the real deployment and the real live
  database** (no Resend account exists, so this is the honest boundary of
  what "live" means here — real HTTP, real Postgres, a fake provider
  key): seeded a throwaway household and a real `homesend_addresses` row
  directly, started the dev server with a fake `RESEND_API_KEY`/
  `RESEND_WEBHOOK_SECRET` pair, and drove the webhook with genuinely
  constructed Svix signatures (not mocked — the same HMAC computation the
  route itself runs) —
  confirmed: an unconfigured server refuses with 401 before reading
  anything; a tampered signature refuses with the identical 401; a validly
  signed request to an address nobody has claims 200 and creates nothing;
  a validly signed request to the seeded address resolves the household,
  reaches the real `fetchReceivedEmail` call against `api.resend.com`, and
  correctly returns 502 (retryable) once Resend rejects the fake key —
  proving the entire pipeline up to the point a real account is plugged
  in, live, not just in a unit test. Confirmed via direct SQL that no
  `home_send_items` row was created for either the unknown-address or the
  fetch-failure case (nothing is ever recorded as "received" for content
  never actually read). The webhook's presence in the OpenAPI document and
  its 405 on GET were also checked live. QA household, address row and
  auth user deleted afterward.

## Still open (deliberately deferred to later phases)

- Address-management UI (view/copy/share/rotate) — Phase 5. The backend
  is complete and tested; nothing blocks wiring a screen to it.
- Attachment fetch/storage for an email's real attachments — Phase 3,
  alongside the generalized `HomeSendProposal` classification schema and
  cross-domain impact analysis. Today an email with attachments is still
  intake-able (its text is read normally); the attachments themselves are
  simply never fetched or mentioned.
- Rate limiting on the webhook — explicitly Phase 6 (Hardening) in the
  architecture doc's own phase split.
- A DNS-verified receiving domain and a real Resend account are a human's
  errand — nobody in this session can create them. Until then this
  channel is real, tested code with no live traffic, exactly like the
  email/calendar/school connectors' own "contract and fixture, not yet
  live" precedent this repo already follows.
