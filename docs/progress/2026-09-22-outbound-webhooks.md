# Story 18-007: outbound webhooks

**Date:** 2026-09-22
**Area:** `packages/core/src/webhooks/`, `packages/core/src/security/webhook-signing.ts`, `apps/web/app/api/v1/households/[householdId]/webhooks/`, `apps/web/app/api/v1/platform/webhook-delivery/`, `supabase/migrations/20260922120000_household_webhooks.sql`

## What was done

Story 18-007 ("Webhooks/events — signed versioned outbound events"), the
next dependency-ready P1 after 16-007 closed. A household can now subscribe
an HTTPS endpoint to five real domain events and receive a signed,
versioned payload with automatic retry:

- **`webhooks/event.ts`** — the versioned envelope
  (`eventVersion`/`eventId`/`eventType`/`householdId`/`occurredAt`/`data`)
  and the curated event-type set: `member.added`, `member.removed`,
  `subscription.changed`, `privacy.deletion_fulfilled`, `homesend.applied`.
  `invitation.accepted` was deliberately left out — that audit call happens
  inside a SQL function (`wh.accept_invitation`), not TypeScript, and
  `member.added` (fired right after, in `identity/invitations.ts`) already
  covers "someone joined" for a subscriber.
- **`security/webhook-signing.ts`** — `signWebhookPayload`/
  `webhookSignatureHeader`/`verifyWebhookSignature`, an HMAC-SHA256 signer
  producing the Svix-style `t=<unix_ts>,v1=<base64_hmac>` header, mirroring
  the inbound verification `homesend/email-gateway.ts` already has. The
  timestamp is part of the signed input (`${timestamp}.${rawBody}`), not
  just attached, so a captured signature can't be replayed against a
  forged timestamp or a different body.
- **`webhooks/url-policy.ts`** — `validateWebhookUrl`, validating a
  household-chosen HTTPS target (scheme, no embedded credentials, allowed
  port, not localhost/private-range/cloud-metadata). Reuses only
  `security/outbound.ts`'s `isPrivateAddress` primitive — that module's own
  `checkOutbound` is allowlist-based for known providers, which doesn't fit
  an arbitrary household-chosen URL. Re-validated again at delivery time,
  since a URL can go from public to private between subscription and send.
- **`webhooks/repository.ts`** — subscription CRUD: `createWebhookSubscription`
  (returns the secret once), `rotateWebhookSecret`, `disableWebhookSubscription`/
  `enableWebhookSubscription` (an admin's "remove" per CLAUDE.md rule 12 —
  never a hard delete, since queued deliveries still reference the row),
  `listWebhookSubscriptions` (member-readable, via a SECURITY DEFINER SQL
  function, never the secret). Every write is admin-gated in application
  code (`requireAdmin`) and audited.
- **`webhooks/dispatch.ts`** — `enqueueWebhookEvent` (testable core, takes
  an explicit admin client) / `dispatchWebhookEvent` (self-contained
  wrapper, creates its own client, never throws — the same split
  `api/audit.ts`'s `recordAuditEvent`/`auditChange` already uses, and for
  the same reason: a webhook enqueue failing must not turn a completed
  household action into an error the caller retries). Wired into the five
  event call sites: `identity/invitations.ts` (member.added),
  `identity/households.ts`'s `deactivateMember` (member.removed),
  `billing/repository.ts`'s `changePlan` (subscription.changed),
  `privacy/fulfill-deletion.ts` (privacy.deletion_fulfilled),
  `homesend/changes.ts`'s `recordHomeSendChange` (homesend.applied).
- **`webhooks/deliver.ts`** — `deliverPendingWebhooks`, the retry/backoff
  worker: six attempts over `[1, 5, 30, 120, 360, 1440]` minutes (~1 day)
  then `'exhausted'`. Re-validates the subscription's `status` and the
  target URL at delivery time before every `fetch`.
- **API routes**: `GET`/`POST /households/{householdId}/webhooks`,
  `PATCH /households/{householdId}/webhooks/{webhookId}` (`rotate` |
  `disable` | `enable`), and a `CRON_SECRET`-gated
  `POST /platform/webhook-delivery` that drains the queue. `vercel.json`
  gained a second daily cron entry (`"30 3 * * *"`) — genuinely a delay,
  not a claim of real-time delivery, honestly documented given the
  project's Hobby-tier daily cron limit (confirmed against the existing
  `/platform/retention` cron's own cadence).

## A real bug found and fixed while building this

The first version of `household_webhooks`'s migration gave `authenticated`
a single `for all` policy gated on `wh.is_household_admin`, mirroring
`household_ai_credentials`'s documented "no SELECT policy, so the secret is
never readable" design. Verifying that claim against a scratch database
(rather than trusting the doc comment) found it was **false**: `for all`'s
USING clause also gates SELECT, so an admin satisfying `is_household_admin`
could read the secret straight back through PostgREST. Splitting the policy
into separate INSERT/UPDATE/DELETE-only policies (still no SELECT) surfaced
a second, more fundamental problem: an UPDATE or DELETE whose WHERE clause
inspects a real column value (`where id = '...'`) additionally requires
SELECT-level row visibility for Postgres to decide whether it matches — not
just the UPDATE/DELETE policy's own USING clause. With no SELECT policy at
all, that visibility check always fails, so a targeted update/delete
silently changes zero rows for every session, admin included.

Since `webhooks/repository.ts` never writes through the household's own
RLS-scoped client anyway (every write goes through the admin/service-role
client, because handing back the freshly-generated secret needs that
client regardless), the fix for `household_webhooks` was to drop RLS write
access entirely — the same "no client reach at all" shape
`webhook_deliveries`/`homesend_share_handoffs`/`audit_events` already use.
That's the migration that shipped.

The same underlying flaw exists in two **already-live** tables:
`household_ai_credentials` and `household_voice_credentials`, both still
carrying the original `for all` policy. Unlike `household_webhooks`,
though, their write paths (`ai/credentials.ts`'s `setHouseholdKey`/
`clearHouseholdKey`, `voice/repository.ts`'s equivalents) **do** write
through the household's own RLS-scoped client — `setHouseholdKey` uses
`.upsert(..., { onConflict: "household_id" })`, which compiles to
`INSERT ... ON CONFLICT DO UPDATE`. Verified empirically: that statement
shape is unconditionally rejected on a table with no SELECT policy — even
on a first insert into an empty table, because Postgres can't certify
`ON CONFLICT`'s visibility requirement without one. A same-shape fix
(narrower INSERT/UPDATE-only policies, or a column-level `REVOKE SELECT
(api_key)`) was tested against a scratch database and both approaches
either leaked the secret anyway (table-level SELECT grants aren't narrowed
by a column-level REVOKE unless the table-level grant is removed first) or
broke the live upsert. Properly closing this needs the same code change
this story made for webhooks — moving those two tables' writes to the
admin client with an app-level `requireAdmin()` check — which is real
scope beyond this story and risks a regression to a working, shipped
feature (bring-your-own-key) if rushed. Left as-is, documented here, and
worth its own follow-up story rather than a same-session patch.

## Verified

- **Unit tests** (`packages/core/src/webhooks/*.test.ts`,
  `security/webhook-signing.test.ts`): 45 tests — signing round-trip/tamper/
  forged-timestamp detection, URL policy (scheme/port/credentials/private
  ranges/cloud metadata), event envelope shape, `enqueueWebhookEvent`
  (one delivery per matching active subscription, distinct event ids),
  `deliverPendingWebhooks` (delivered/retrying/exhausted/skipped, correct
  signed headers, URL re-validated and subscription re-checked at delivery
  time), and the full `repository.ts` CRUD (admin guard, URL/event-type
  validation, rotate/disable/enable, `listWebhookSubscriptions` never
  returning the secret).
- **DB/RLS tests** (`scripts/test-webhooks-rls.mjs`, 7 tests): no session,
  admin included, can create/read/update/delete `household_webhooks`
  directly; `event_types` cardinality constraint; `list_webhook_subscriptions()`
  answers for any member without the secret and is household-scoped;
  `webhook_deliveries` is unreachable from any session, service-role only.
  `scripts/lib/db.mjs`'s own gotcha note was corrected in the same pass:
  DELETE, not just UPDATE, can silently match zero rows under RLS rather
  than throwing — `deniedForUpdate` (the existing helper) works unchanged
  for a DELETE statement, it was the file's own doc comment that was wrong.
- **Full verify gate**: typecheck, lint, migration/embed/boundary/secret
  lints, tracker check, brand check, security suite, 43 script tests, 310
  DB/RLS tests, production build, 284 e2e tests — all green.
- **Live migration**: applied via Supabase MCP `apply_migration` to the
  `wonderhome` project (`kqxndableyysxqhxiorz`). `npm run verify:live`:
  88/88 checks pass, including two new ones added to
  `scripts/verify-live-project.mjs` (`household_webhooks`/
  `webhook_deliveries` land as real tables; an anonymous caller can neither
  read a webhook secret nor forge a subscription).
- **Live end-to-end verification**: created a QA household
  (`c29c71c5-f289-4ca8-b969-be2320261551`) via `qa-test-user.mjs` and a
  second member to deactivate. Signed in via Playwright, subscribed a
  webhook to a real `webhook.site` endpoint for `member.removed` and
  `subscription.changed` — the create response carried the secret exactly
  once, the list response never did. Removed the second member through the
  real Family UI, confirmed a `pending` `webhook_deliveries` row was
  enqueued, called the real `CRON_SECRET`-gated `/platform/webhook-delivery`
  route — `{"delivered":1,...}` — and confirmed via webhook.site's own API
  that a real signed POST arrived with the correct payload and headers.
  Independently recomputed the HMAC-SHA256 signature in Node using the
  secret returned at creation time and the received timestamp/body: it
  matched exactly, proving the signing implementation is correct against a
  real request, not just against its own unit tests. Verified rotate
  (returns a new secret), disable, and enable via the real API routes.
  Deleted all QA data (the household cascaded its members/roles/webhooks/
  deliveries; the profile and auth account were removed separately) and
  stopped the dev server.

## Still open

- The `household_ai_credentials`/`household_voice_credentials` SELECT-leak
  (see above) — needs a follow-up story moving those two tables' writes to
  the admin client, matching this story's own `household_webhooks` design,
  before their RLS policy can be tightened without breaking the live BYOK
  feature.
- Real-time delivery is still bounded by the project's Hobby-tier daily
  cron limit (`"30 3 * * *"`), same honest limitation `/platform/retention`
  already carries. A paid Vercel plan (or an external scheduler hitting the
  same `CRON_SECRET`-gated route more often) would close that gap without
  any code change.
- `invitation.accepted` is not one of the five wired events (see above) —
  `member.added` already covers the "someone joined" case for a subscriber;
  revisit only if a real subscriber asks for the finer distinction.

## Where the code lives

- `packages/core/src/webhooks/` — `event.ts`, `dispatch.ts`, `deliver.ts`,
  `repository.ts`, `url-policy.ts`, and their tests.
- `packages/core/src/security/webhook-signing.ts` and its test.
- `apps/web/app/api/v1/households/[householdId]/webhooks/` — subscription
  CRUD routes.
- `apps/web/app/api/v1/platform/webhook-delivery/route.ts` — the cron-gated
  delivery worker route.
- `supabase/migrations/20260922120000_household_webhooks.sql`.
- `scripts/test-webhooks-rls.mjs`.
- `scripts/verify-live-project.mjs` — two new live checks.
