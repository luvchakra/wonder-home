# 2026-10-26 — School channels, backend (08-031, PR A)

The owner asked to implement a "connect school" screen (08-029) and the
continuous tracking of a school message channel (08-031). This is the backend
half of 08-031; the Connect-school UI (08-029) and the channel UI + poll are the
next PR.

## What was done
A household can track a message channel inside a connected school portal — a
class group, a notice board (e.g. `.../channel/2044541`). This builds where its
messages land.

- **Migration `20261026210000_school_channels.sql`** (applied live, verified):
  - `school_channels` — one row per tracked channel on a school connection,
    with the child it is about (optional), `active`, `created_by`, and a
    poll cursor (`last_message_external_id`, `last_polled_at`).
  - RLS: an Admin adds/changes/removes (`wh.admin_households()`); every member
    reads which channels are tracked, except a channel tied to one child, read
    only by those who may see that child (`wh.may_see_child`). Set-form helpers
    only; passes the per-row-helper guard.
  - The HomeSend `school_channel` source: the `home_send_items` source check and
    has-content check widened (order-safe — only widens; nothing writes the new
    value until this code deploys).
- **`school/channel-repository.ts`** — list / add (reactivate, keyed by
  connection+channel) / stop-resume (keeps the cursor) / record-poll.
- **`homesend/ingest.ts` `ingestSchoolChannelMessage`** — files a channel
  message as a `school_channel` intake: understood, injection-scanned,
  idempotent by the channel message key, awaiting a person. Read-only; a channel
  is never an authorization channel. Takes primitives (externalId, text, url,
  from, description) so HomeSend keeps no dependency on the school domain.
- **`homesend/channels.ts`** groups the source under the inbox's Uploads tab;
  source label added in all eight languages (`homesend.source.schoolChannel`).

## Why this shape
A channel feed is free-form, untrusted content, so it goes through HomeSend —
nothing written until a person confirms — not the connector's direct-write path.
Its actor is the Admin who added the channel (every non-email intake carries the
member who brought it in); the message did not come from them, and nothing in it
decides who it belongs to.

## Verified
- `school-channel.test.ts` 3/3; `test-school-channels-rls.mjs` 6/6;
  per-row-helper guard 5/5; homesend + school + i18n suites 586/586.
- Core + web typecheck clean; migration lint 175/175; secret lint clean.
- Live: `school_channels` RLS on with 4 policies; `home_send_items_source_check`
  includes `school_channel`; `get_advisors` security shows nothing new for the
  table (all findings pre-existing).

## Open / needs a person
- **PR B (08-029 + the rest of 08-031):** the Connect-school screen (provider
  picker, forward path, portal registration, guardian consent, child mapping),
  the channel paste/manage UI, and the sync orchestrator that files a live
  provider's channel messages — a no-op until a portal adapter ships, since no
  portal is live. Eight languages, 360px/desktop QA.
- No portal is live; nothing polls a real portal yet, and nothing is written
  back to a portal.

## Where the code lives
- `supabase/migrations/20261026210000_school_channels.sql`
- `packages/core/src/school/channel-repository.ts`
- `packages/core/src/homesend/ingest.ts` (`ingestSchoolChannelMessage`),
  `items.ts`, `channels.ts`, `school-channel.test.ts`
- `apps/web/app/_lib/homesend-labels.ts`,
  `packages/core/src/i18n/messages/areas/homesend/*.ts`
- `scripts/test-school-channels-rls.mjs`
- Backlog: 08-031 In Progress
