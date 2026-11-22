# Platform admin: Test WhatsApp

**2026-11-22.** The owner asked for "a test button for WhatsApp" after "hi" went unanswered (cause and fix: `2026-11-22-whatsapp-saved-settings-reach-routes.md`, #624).

## What it does
Platform admin → Integrations → WhatsApp → **Test WhatsApp**. One run; one line per check, ✓, ✗ or – (couldn't run) and what to do:
1. **Settings present**: the nine WhatsApp settings and where each comes from (saved here / Vercel / default / missing).
2. **Access token valid**: `GET /{phone-number-id}?fields=display_phone_number,verified_name,quality_rating`. Shows Meta's number and verified name, and whether they match the saved business number. Error 190 (subcodes 463/467) reads as "Access token expired or invalid — generate a permanent system-user token".
3. **Webhook address**: `GET /{app-id}/subscriptions` with the app access token. Reports a different callback URL, an inactive webhook, or an unticked `messages` field. Meta's reference says WhatsApp webhooks are set in the App Dashboard, so if Meta reports none, the line reads "can't confirm" and says what to set.
4. **Business account subscribed**: `GET /{waba-id}/subscribed_apps` with the access token. Meta's embedded-signup docs say each WhatsApp business account must be subscribed to the app before it delivers anything, so this check is the authoritative one.
5. **Webhook self-test**: a body marked `{"object":"wonderhome_self_test"}`, HMAC-SHA256-signed with the saved app secret, POSTed to the site's own webhook URL. A 200 proves the deployed webhook sees the same secret. The webhook drops a correctly signed self-test right after the signature check: no event, message, HomeSend item, job or reply (`self-check.test.ts`).

New settings: `WHATSAPP_APP_ID` and `WHATSAPP_BUSINESS_ACCOUNT_ID` (plain). Only the test uses them, and without them their checks are skipped, not failed.

## Rules kept
- Only staff with `settings.manage` can run it. Rate limit `platform.whatsapp_test`, 6 per 10 min per staff member.
- Each run writes an audit event `platform.whatsapp_tested` with each check's result.
- Reads the store afresh. No secret value appears in any line, log or audit row. Graph calls time out after 8 s, the self-test after 16 s. The action is a server action, so nothing is cached.
- Platform admin screens are English-only (existing convention).

## Not done
- "Send a test message" to the admin's own linked number (optional in the ask) is left for a follow-up. Checks 2 and 5 cover the outage.
- The sender and the test use Graph `v21.0`. Meta's latest is `v27.0`, and v21.0 (Oct 2024) is near or past its two-year life. If check 2 fails with a version error, upgrading `GRAPH` in `notifications/whatsapp.ts` is the fix.

## Verified
`self-check.test.ts` (10 tests) plus the related settings, security, audit and webhook tests: 48 files, 639 tests. Typecheck clean; `next build` passes.
