# WhatsApp into HomeSend: the screens (story 14-016)

**Date:** 2026-09-24 · **Module:** 14 AI Orchestration (now complete) · **PR:** WhatsApp HomeSend, part 2 of 2

## What was done

Part 1 (story 14-015) built the backend: codes, links, intake and the job
queue. This part adds the mockup's screens. Each one reads the verified
link on the server and never takes the browser's word for anything.

- **`/settings/whatsapp`** (brief screens 1–4 and 12). It shows one of
  five states:
  - **Not set up.** The deployment has no WhatsApp number, so the page
    says so and offers no button.
  - **Adults only.** A child or helper is told only adults can connect.
  - **Intro.** What WhatsApp can take in, then "Let's connect". When
    another adult is already linked, the intro becomes "Connect your
    WhatsApp too".
  - **Instructions.** These show:
    - WonderHome's number, with an icon button to copy it;
    - the steps to follow;
    - the exact `CONNECT <code>` message, valid once for 15 minutes;
    - "Open WhatsApp" (a `wa.me` link with the message filled in);
    - "Get a new code".

    "I've sent the message" only looks again. If there is no link yet it
    says "Not linked yet".
  - **Connected.** Once the server has linked the number, the action
    redirects to `?connected=1`. The page then shows the confirmation
    from the server's own record, above "Your WhatsApp": the number,
    when it was connected, the last message, and a disconnect button
    (with a confirmation sheet).

  An admin also sees every other adult's link and can disconnect any of
  them. The page ends with a plain panel on what WhatsApp can and can't
  do: nothing is paid, ordered, booked or approved from it.
- **Settings.** A WhatsApp row sits under Preferences.
- **Manage Household → Members.** A "WhatsApp connected" badge appears
  under a member's name. It comes from the ids-only
  `household_whatsapp_members`, so nobody sees another member's number.
- **HomeSend.**
  - **Channel card.** "Forward it on WhatsApp" is a card among the other
    channels. It shows WonderHome's number once you're connected, or a
    prompt to connect, and opens `/settings/whatsapp`.
  - **Filter.** The inbox has an All / WhatsApp / Email / Uploads filter
    (`homesend/channels.ts`), placed between the drop zone and the lists
    it filters:
    - a tab appears only when its channel is available or already has
      items;
    - with only uploads, there is no filter at all;
    - counts are items waiting on a person;
    - a filtered tab with nothing in it says so.
  - **Provenance.** A WhatsApp item says what it was and who sent it:
    "A WhatsApp message from Priya", "A photo sent on WhatsApp from
    Priya".
- **Audit.** Three new audit events, each described in the household's
  audit view (`security/sensitive-actions.ts`):
  - `whatsapp.connect_requested`
  - `whatsapp.linked`, written by the intake when a CONNECT completes
  - `whatsapp.disconnected`
- **Repository.** `whatsapp/repository.ts` holds `listWhatsAppLinks`,
  `whatsappConnectedMembers` and `disconnectWhatsApp`. Each runs on the
  member's own session, so RLS decides who sees what.

## Found and fixed during QA

- **The confirmation never appeared.** Linking revalidated the page,
  which re-rendered straight into the connected card and dropped the
  client state that held the confirmation. The check now redirects to
  `?connected=1`, and the page renders the confirmation itself.
- **The number broke across lines.** At 360px the business number
  wrapped mid-number. The copy control is now an icon button with an
  accessible label (rule 11), and the number never breaks.

## Verified

- **Unit tests.**
  - `homesend/channels.test.ts` (5 tests): every source is in exactly one
    tab; an unknown value reads as All; there are no tabs when uploads are
    the only way in; WhatsApp appears once it is available or used;
    counts and links are right.
  - Security and API suites: 210 tests, including the new audit events.
  - WhatsApp suite: 18 tests.
- **Typecheck and lint**: clean.
- **Browser QA** at 360px and 1280px, no horizontal scroll on any page.
  - **Setup.** A local dev server ran with placeholder WhatsApp settings
    (fake values, never real credentials). A QA account signed in to the
    live project.
  - **Connecting.**
    - The intro showed first.
    - The code and the "Open WhatsApp" link (`wa.me/919876543210?text=CONNECT%20…`) appeared.
    - An early check said "Not linked yet".
    - A CONNECT webhook, signed with the local placeholder secret, linked
      the number.
    - The confirmation appeared.
  - **Disconnecting and reconnecting.** Disconnect through the
    confirmation sheet, then reconnect.
  - **The rate limit.** A fourth CONNECT from one number within the hour
    was refused as designed (`rate_limited` in telemetry). The run then
    used a second test number.
  - **Intake.** A WhatsApp text became a HomeSend item "from Priya".
  - **The filter.** All / WhatsApp / Uploads, the filtered empty state,
    the member badge and the Settings row all showed correctly.
  - **Acknowledgement.** Sending it failed, as expected with a
    placeholder token. It was recorded as `ack_failed`, and nothing else
    was affected.

## Still open / needs a person

- **Credentials.** As in part 1, everything is inert until a WhatsApp
  Business account exists:
  - Cloud API credentials, `WHATSAPP_BUSINESS_NUMBER`, and the webhook
    subscribed to `messages`.

  Until then, production shows "Not available yet" and offers nothing.
- **Not browser-tested.** The admin view of *another* adult's link needs
  a second adult account. RLS for it is covered by
  `scripts/test-whatsapp-rls.mjs`.
- **Later steps.** Reading a WhatsApp reply to a clarification ("Aarav or
  Anya"), video, and iOS `.m4a` voice memos, as noted in part 1.

## Cleanup

See the PR. QA account `7c8d1e43-75b3-4a7d-a395-89abb9015f32`, household
`706dd6b7-77f3-46d9-b5e2-e4168dafe4da`.

## Where the code lives

- `apps/web/app/settings/whatsapp/page.tsx`
- `apps/web/app/_components/whatsapp-connect.tsx`
- `apps/web/app/(auth)/whatsapp-actions.ts`
- `apps/web/app/household/members/page.tsx`
- `apps/web/app/home-send/page.tsx`
- `apps/web/app/_components/home-send-channels.tsx`
- `apps/web/app/_components/home-send-inbox.tsx`
- `apps/web/app/_components/home-send-intake.tsx`
- `packages/core/src/homesend/channels.ts`
- `packages/core/src/whatsapp/repository.ts`
