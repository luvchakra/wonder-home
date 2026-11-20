# HomeSend: WhatsApp as an icon beside the opening sentence, empty card gone

**Date:** 2026-11-20 · **Asked by:** the owner, on a marked-up phone screenshot ("remove the crossed out sections, move WhatsApp to top right as an icon").

## What changed
- **"Nothing sent yet" card removed** (`home-send-inbox.tsx`). With nothing to list, nothing takes its place; the "Send something" card above already says how to send.
- **"Forward it on WhatsApp" row removed** from "Other ways to send things in" (`home-send-channels.tsx`). In its place `HomeSendWhatsAppButton`: a 44 px link at the right of the opening sentence (new `leadAction` slot on `HomeSendInbox`), the kit's `IconTile` with the same icon and `handled` tone, going to the same place the row did (`/settings/connections#whatsapp`). Its accessible name is the row's own label (`homesend.channels.whatsappTitle`, all eight languages); the row's line (the number and "it arrives here as from you", or "Connect your number…") is its description and tooltip. Shown, as before, only to adults when WhatsApp is configured.
- **The heading stays** when other rows remain: email forwarding (where configured) and "Add to share sheet" (until the app is installed). With neither, the section is hidden as before.
- **Help:** `help.guide.home-send.body.14` gains one sentence in all eight languages on the WhatsApp button. The section's `updated` is already 2026-11-20.

## Left as it was
- The first-time welcome card (shown only before a household has ever sent anything) still offers "Connect WhatsApp" when the adult's number isn't linked; the help text describes it. Removing it would be the owner's call (rule 14).

## Verified
- `tsc` for `apps/web`, ESLint on the three touched files, `vitest` on `home-send-channels.test.tsx` and `packages/core/src/help` (78 passed), `lint:help-links`, production build.
- `scripts/ui-check.mjs /home-send` on a production build against a QA household, WhatsApp configured with a dummy number: at 360 px the icon is at x=306, 44×44, the sentence wraps beside it (282 px), no overflow; at 1280 px the same at the right of the content column. No "Nothing sent yet", no WhatsApp row; "Other ways to send things in" keeps "Add to share sheet".
- No unit or E2E spec selected the removed elements.

## Cleanup
The QA user and household made for the check were deleted (count 0, user gone); the local server was stopped.
