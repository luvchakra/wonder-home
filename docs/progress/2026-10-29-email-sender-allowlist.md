# Email reading, gated by a per-household sender allowlist (story 17-016)

**Date:** 2026-10-29
**Owner request (2026-10-29):** on Settings → Connections, the Email card — "add option to add feature to read mails, limit the sender from which email reading is allowed." Decision (owner): both methods, **forwarding first**; ship the forwarding-address + sender-allowlist method now, queue account sign-in (Gmail/Outlook OAuth, read-only) as a later story. The sender allowlist is the core: WonderHome reads/processes mail only from senders the household approved, and drops everything else.

## What was done

Built the privacy gate on top of the email intake pipeline that already existed (HomeSend Phase 2): the inbound Resend webhook, the per-household forwarding address, and `ingestEmailAttachment` were already there and already turned forwarded mail into HomeSend items. The new work is the allowlist and its enforcement, plus the Connections UI.

### The gate (core)
- **Table** `homesend_email_allowlist` (migration `20261029090000_homesend_email_allowlist.sql`): one row per approved sender, per household — `kind` is `address` (an exact `bills@bescom.co.in`) or `domain` (a whole `school.edu`, stored without `@`). Member-readable, Admin-writable, **set-form RLS** (`household_id in (select wh.member_households())` / `admin_households()`), unique `(household_id, kind, value)` (its index serves the webhook lookup and the member read), a FK index on `created_by_member_id`. Audited via `homesend.allowlist_added` / `homesend.allowlist_removed` (added to `AuditEventType`). Entries are immutable — add/remove only.
- **`homesend/email-allowlist.ts`**: `normalizeAllowlistEntry` (accepts an address, `@domain`, or a bare `domain`; rejects malformed input), `describeAllowlistEntry`, `senderMatchesAllowlist` (pure — **empty list matches no one**; a domain matches its own addresses, never a subdomain or a look-alike like `school.edu.evil.com`), the repository (`loadEmailAllowlist`, `addEmailAllowlistEntry` with upsert-on-duplicate, `removeEmailAllowlistEntry`), and `allowedHouseholdsForSender` (one query for the recipient households, grouped and matched in memory — the "one wave" rule).

### Enforcement (webhook)
- In `email-webhook.ts`, the gate sits right after the message is fetched (the sender is known only then — the `email.received` event carries none of it) and before anything is stored. A sender no recipient household approved is **dropped**: it never becomes a HomeSend item, its attachments are never fetched, its text and files are never kept, and it leaves only a non-personal `dropped_not_allowlisted` counter (new event kind in `email-monitoring.ts`). If no recipient household approves the sender, the webhook acks 200 and keeps nothing (never revealing the address exists). Matched mail runs the unchanged pipeline — still waits for confirmation; bills/receipts/health always wait; content stays untrusted (`injection.ts`).
- **Default empty = nothing read.** A household that has approved nobody reads nothing; the gate ships with the code that reads the table, so there is no window where mail flows before a sender is approved (migration is safe in either order — an old reader without the table simply never ran; the new reader treats "no rows" as "allow no one").

### UI (Connections)
- Admin-only **Email** section (`settings/connections/email-section.tsx` + `_components/email-connection.tsx`), wired into `settings/connections/page.tsx` behind `integrations.manage`. Shows the household's private forwarding address (the existing `homesend_addresses`, reused — create / copy / rotate / turn off) and the add/remove allowlist manager. Copy is explicit: WonderHome never signs in to your inbox, it reads only approved senders, and an empty list reads nothing. When `WONDERHOME_HOMESEND_EMAIL_DOMAIN` is unset the section says it isn't set up and offers no controls.
- Server actions `(auth)/homesend-allowlist-actions.ts` (Admin-only; `requireHouseholdAdmin` over the RLS 42501). Address actions now also revalidate `/settings/connections`.

## Decisions
- **Who edits the allowlist: Admins.** It is a privacy gate for the whole household, so it matches the forwarding address (Admin-only) and the Email provider card (behind `integrations.manage`). Members can read it.
- **Match the message's own `from`.** An auto-forward rule in the household's mail provider preserves the original sender, which is what the allowlist is about (the help copy tells people to set such a rule). A manually forwarded message carries the forwarder as `from`; that is the honest limit of this phase.
- **No SPF/DKIM claim.** The provider schema doesn't expose authentication results reliably, so we don't pretend to verify them. The `from` match is the gate, not proof; the HomeSend confirmation step is the backstop (CLAUDE.md: never claim verification you don't have). SPF/DKIM/ARC is a future enhancement once the field is confirmed.
- **OAuth is phase 2** (story 17-017, queued): the dormant connected-mailbox path (`finance/email-connector`, `integrations/email/sync`, which 409s until a connector is live) will reuse the same gate at its sync boundary.

## Verified
- Unit tests green: `email-allowlist.test.ts` (normalization, matching, `allowedHouseholdsForSender`) and `email-webhook.test.ts` (existing HS-006/008/009 updated to seed an allowlist; new HS-016 — a non-approved sender is dropped with no item, no fetch, only the counter; empty allowlist reads nothing; exact-address match passes). 37 tests.
- Typecheck, lint, build: see the PR.
- RLS (who may edit) is covered at `test:db`.
- Signed-in browser check of the Email card + allowlist manager at 360 px and desktop: see the PR.
- Migration applied to the live project and `npm run verify:live`: see the PR.

## Where the code lives
- Gate: `packages/core/src/homesend/email-allowlist.ts`, `email-webhook.ts`, `email-monitoring.ts`; migration `supabase/migrations/20261029090000_homesend_email_allowlist.sql`.
- UI: `apps/web/app/settings/connections/email-section.tsx`, `apps/web/app/_components/email-connection.tsx`, `apps/web/app/(auth)/homesend-allowlist-actions.ts`.
- Words: `connectionsPage.email.*` (all eight top-level catalogs); help `help.guide.home-send.body.6` (all eight help catalogs), section `updated` 2026-10-29.
- Design note: `docs/email-allowlist-and-phasing.md`.

## Open / needs a person
- Email intake is live only where the deployment sets `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` and `WONDERHOME_HOMESEND_EMAIL_DOMAIN`. Until then the Email section says it isn't set up.
- Story 17-017 (Gmail/Outlook OAuth read-only) is queued, not built.
