# WhatsApp into HomeSend: linking and intake (story 14-015)

**Date:** 2026-09-24 · **Module:** 14 AI Orchestration · **PR:** WhatsApp HomeSend, part 1 of 2 (backend)

## What was done

The WhatsApp HomeSend integration brief asks for WhatsApp to become an
official intake. A household adult links their own number; anything they
then send or forward to WonderHome's business number arrives in their
household's HomeSend. Until now WhatsApp only carried reminders out
(story 17-006), and the webhook ignored everything but delivery reports and
STOP. This part is the backend. The screens are story 14-016.

WhatsApp is an input channel, never an authorization channel. Everything
below holds to that.

- **Migration `20261002090000_whatsapp_intake.sql`** (applied live) adds:
  - `whatsapp_identities`: the verified link between a number and one adult
    member.
    - One active link per number anywhere, and one per member.
    - The number is visible only to its member and the household's admins.
    - Every other member learns only who is connected, through
      `public.household_whatsapp_members`.
    - No session writes the table.
  - `whatsapp_link_requests`: the single-use CONNECT codes, stored as SHA-256
    hashes and valid for fifteen minutes. No session can read them.
  - `whatsapp_messages`: one row per inbound message from a linked number.
    - `provider_message_id` is unique, which makes it the idempotency key.
    - A trigger binds each row to its identity's household and member.
    - What happened to the message is recorded in closed words.
  - `whatsapp_events`: closed-word, content-free telemetry, readable by the
    service role only.
  - `home_send_items` gains two sources, `whatsapp` and `whatsapp_media`,
    each of which must name a member.
  - `public.complete_whatsapp_link` (service role only, atomic) and
    `public.disconnect_whatsapp` (the member or an admin; keeps history).
- **Linking (`whatsapp/linking.ts`).**
  - A code is 10 characters from a 31-letter alphabet with no 0/O or 1/I/L.
    It is issued to a member and redeemed only by the exact message
    "CONNECT <code>".
  - Outcomes are closed words: linked, already_linked, invalid, expired or
    in_use. Each has a plain reply that never names a household or a person.
  - Attempts from any one number are limited to three an hour.
- **Intake (`whatsapp/inbound.ts`, `whatsapp/intake.ts`).**
  - **What is read.** The webhook reads the message id, sender, time, type,
    words or caption, and media id. It drops reactions and system notices.
  - **Order of handling.** STOP still comes first. CONNECT links a number.
    A number with no link is told how to connect, the same way for anyone,
    and nothing it sent is kept.
  - **Linked messages.** A message from a linked number is recorded once and
    queued as a `whatsapp.process` job. The webhook responds, and Next's
    `after()` drains the job. The daily cron drains anything left over. The
    job queue supplies backoff and marks a job dead after five tries.
  - **Processing.**
    - A text becomes a `whatsapp` item via `ingestWhatsAppText`.
    - A photo, PDF, text file or voice note is fetched from Meta's CDN
      (`whatsapp/media.ts`: Meta hosts only, 10 MB cap). Its type is decided
      from its bytes, it is kept in the private `home-send` bucket, and it
      becomes a `whatsapp_media` item with its caption.
    - Video and stickers are refused politely.
    - The item's `external_id` is WhatsApp's message id, so a retried
      delivery produces one item. Its member is the sender.
    - From there the item goes through the same understanding, review and
      confirmation strategy as any other.
  - **The acknowledgement (`acknowledgementFor`).**
    - It is short and sent once, inside the 24-hour window the person
      opened by writing.
    - It never echoes an amount, a health detail or a number: a bill is
      just "a bill".
    - When two people could fit, it asks which ("Aarav or Anya").
- **Webhook changes (`notifications/whatsapp-webhook.ts`).**
  - A 256 KiB body cap.
  - A failed signature is recorded in telemetry.
  - A failure to record a message returns 500, so WhatsApp retries.
    Recording is idempotent, so the retry is safe.
- **Plumbing.**
  - `drainJobs` takes extra handlers.
  - A classify retry for a WhatsApp item keeps its channel.
  - New rate-limit buckets: `homesend.whatsapp` (60 an hour per member),
    `whatsapp.link` and `whatsapp.unlinked`.
  - `/platform/retention` drains WhatsApp jobs and prunes WhatsApp telemetry
    older than 90 days and codes that expired over a day ago.
  - The OpenAPI entry is updated.

## Verified

- **Unit tests** (`whatsapp/whatsapp-intake.test.ts`, 18 tests):
  - reading payloads;
  - codes;
  - linking and its failure replies;
  - unknown senders keeping nothing;
  - retries recorded once;
  - household and member ids forged into a payload being ignored;
  - bad signature and oversized body refusals;
  - text and photo becoming one HomeSend item each, acknowledged once;
  - a media outage retried without any reply;
  - unsupported types refused;
  - an injected "transfer money" instruction kept as content, flagged, with
    nothing written outside HomeSend;
  - replies never echoing amounts or health details.

  The existing WhatsApp tests pass unchanged. The WhatsApp, notifications,
  HomeSend and security suites pass in full: 596 tests.
- **Database suite** (`scripts/test-whatsapp-rls.mjs`, 10 tests):
  - single-use and expiring codes;
  - a second adult linking;
  - one number linked to one member anywhere, even by a direct insert;
  - adults only (not a child, a helper or another household's member);
  - who sees what;
  - no client writes, and no session completing a link;
  - a message bound to its link and kept once;
  - both HomeSend sources requiring a member;
  - disconnecting by the member or an admin but no outsider, with history
    kept;
  - relinking a new number ending the old link.
- **`npm run verify:live`**: 199 of 199 checks passed. New probes confirm the
  server completes a link and refuses an unknown code, anonymous can neither
  complete a link nor read telemetry, and HomeSend accepts a `whatsapp`
  item.
- **Full `npm run verify`**: see the PR.

## Still open / needs a person

- **Screens (14-016, done since — see `2026-09-24-whatsapp-homesend-screens.md`).** Connect WhatsApp, member status, the HomeSend
  channel and filter, and Settings management. Until then no one can ask
  for a code.
- **Credentials.**
  - A WhatsApp Business account, a verified business number, an approved
    template, and the Cloud API credentials
    (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
    `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_APP_SECRET`,
    `WHATSAPP_VERIFY_TOKEN`), plus `WHATSAPP_BUSINESS_NUMBER` for the app to
    show.
  - The webhook subscribed to the `messages` field.

  This is a person's errand. Until it is done, everything here is inert and
  nothing is labelled connected.
- **Clarification replies.** A WhatsApp answer to "which child?" is not read
  yet. The question is answered in HomeSend. Reading the reply is a later
  step.
- **Not handled yet.** Video, and iOS `.m4a` voice memos, which HomeSend's
  audio reader already refuses. A bare link is kept as text rather than
  fetched.

## Where the code lives

- `packages/core/src/whatsapp/`: `inbound.ts`, `linking.ts`, `intake.ts`,
  `media.ts`, `events.ts`.
- `packages/core/src/homesend/ingest.ts`: `ingestWhatsAppText`,
  `ingestWhatsAppMedia`.
- `packages/core/src/notifications/whatsapp-webhook.ts`.
- `supabase/migrations/20261002090000_whatsapp_intake.sql`.
- `scripts/test-whatsapp-rls.mjs`.
