# WhatsApp as a notification channel (story 17-006 Done)

**Date:** 2026-09-24 · **Module:** 17 External Integrations · **Story:** 17-006

## What was done

Story 06-008 had built the channel adapters: in-app live, and push, email and
WhatsApp as fixtures. But nothing ever dispatched to them. A notification
reached its row in the inbox and went no further. This story makes WhatsApp
a real channel and wires delivery in.

- **Adapter** (`packages/core/src/notifications/whatsapp.ts`): Meta's
  WhatsApp Cloud API.
  - Every notification goes out as the deployment's approved template, with
    the household's title and text as its two body parameters, each flattened
    to one line.
  - Only E.164 numbers are tried.
  - Errors come back in closed words: a number that can't receive is
    `no_target`, rejected credentials are `not_configured`, and 429 or 5xx is
    retryable `unavailable`. The provider's prose is never kept.
  - `whatsappConfigFromEnv` needs `WHATSAPP_ACCESS_TOKEN`,
    `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_TEMPLATE_NAME`.
    `channelAdaptersFromEnv` swaps the fixture for the real adapter only when
    all three are set.
- **Delivery** (`packages/core/src/notifications/deliver.ts`, called from
  `createNotification`).
  - A new notification that is due now also goes to the recipient's *live*
    channels, subject to their switches and quiet hours (`selectChannels`).
  - Each attempt leaves a `notification_events` row: `sent` with the
    provider's message id, or `delivery_failed` with the error code.
  - A fixture channel leaves nothing, because it never tried.
  - An update to an open thread never pings again.
  - Delivery never throws, so a channel's trouble can't fail the
    notification.
- **Webhook**: `GET/POST /api/v1/whatsapp/webhook` via
  `whatsapp-webhook.ts`.
  - GET answers Meta's handshake only for `WHATSAPP_VERIFY_TOKEN`.
  - POST is believed only after `X-Hub-Signature-256` (HMAC-SHA256 of the raw
    body with `WHATSAPP_APP_SECRET`) verifies.
  - Unconfigured, a wrong token and a bad signature all get the standard 401.
  - A delivery report adds `delivered`, `seen` (read) or `delivery_failed`
    to the notification its message id belongs to, once.
  - "STOP" (and close variants, nothing looser) switches WhatsApp off for
    that number on the spot and confirms it, as WhatsApp's policy requires.
    Turning it back on is only the member's own act in the app.
  - Nothing else written there is acted on.
- **Settings.** The notification settings screen now shows each channel's
  real liveness, instead of assuming only in-app is live.
- **Migration** `20260927130000_notification_channel_delivery.sql`, **applied
  live**: adds the event words `sent` and `delivery_failed`, and an index on
  `metadata->>'providerMessageId'`.
- **OpenAPI** documents both webhook methods.

## Verified

- typecheck and lint are clean.
- Unit tests: 2535/2535. New: 12 WhatsApp tests:
  - the template request shape;
  - E.164 gating;
  - error mapping, with no leaked provider text;
  - env gating;
  - signature accept and reject;
  - closed-word webhook reading;
  - STOP matching, strict;
  - the handshake;
  - 401s;
  - a read report recorded once against its notification, with STOP
    honoured and a reply sent;
  - delivery recording `sent` with the message id;
  - fixture-only delivery writing nothing.
- `test:db`: 463/463. The notifications suite is 17/17; new: server-written `sent` and
  `delivery_failed` events a member cannot forge, and an unknown event word
  refused.
- `npm run verify:live`: 164/164, including the new event-word probe.
- Against the dev server, both webhook methods returned the standard 401
  envelope, and the route is in the OpenAPI document (the e2e contract).
- Browser QA at 360px and desktop, with the dev server given placeholder
  WhatsApp settings: WhatsApp's "Not connected for this deployment yet" note
  was gone while Email kept it, with no overflow. The dev server was then
  stopped, so the placeholders were never used to send anything.

## Needs a person

- A WhatsApp Business account, a verified sender number and an approved
  template with two body parameters.
- Registering `/api/v1/whatsapp/webhook` with Meta, and setting the five
  `WHATSAPP_*` values on the deployment.

## Open

- Future-dated (quiet-hours-deferred) notifications are not yet sent beyond
  the app when their time comes. That needs a scheduled job.
- Push and email are still fixtures.

## Test data cleanup

Ran after PR #140 merged. The QA household "Channel QA Home"
(`8b424086-23d9-49c5-83dd-4bd6cd2bcbd2`) was deleted with its one audit row,
the `verify.live` rate-limit row the probe run left was removed, and the QA
account `3d7f93f2-7528-4504-8848-e910621d949c` was deleted with
`node scripts/qa-test-user.mjs delete`. A SQL count afterwards found no
household, member, audit row, notification preference, profile or auth user
left. The dev server was stopped. Nothing was left behind.
