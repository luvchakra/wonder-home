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

## Part 2: a clutter-free HomeSend (owner, 2026-11-20: "make HomeSend a really clutter free and intuitive interface with minimum human input required")

Same PR (#569). The behaviour side shipped in #562–#564; this pass is the screen.

### Audit (production build, QA household, `ui-check` + main's visible text and controls)
States measured: **empty** (nothing ever sent) and **full** (2 added today, one of them Checking, 2 set aside, a Needs-you question open). Needs-you questions live at the top of HomeTalk, so here they show only as the opening sentence's count. Trusted senders are under Settings → Connections → Email, not on this page. The Admin controls on this page are "Delete all set aside" and the email-address setup.

| State, 360 px | Text lines before → after | Controls before → after | Page height |
|---|---|---|---|
| Empty | 15 → 7 | 5 → 3 | 987 → 900 |
| Full | 26 → 13 | 8 → 3 | 1206 → 968 |

At 1280 px: empty 18 → 9 lines, full 29 → 15 lines, controls as at 360. No horizontal overflow in any state.

Before (full): today's card *above* the opening sentence; the sentence and WhatsApp icon; "Send something / photo · file · paste · link", a row to open before anything could be picked; "Added recently" with an intro line; "Set aside" heading, an explanatory paragraph, "Delete all set aside" and every row with Restore/Delete; "Other ways to send things in" open with Install; the closing line. Empty added a three-line welcome card whose "Connect WhatsApp" and "Add to share sheet" repeated the WhatsApp icon and Install (rule 14).

### What changed
- **The opening sentence opens** (rule 7): today's card moved under it (`summary` slot on `HomeSendInbox`).
- **Sending is one tap**: "Choose a file" and "Paste a message or link" sit on the card. There's no row to open first and no Close; the "photo · file · paste · link" hint repeated the buttons and is gone. On a computer one line still says drop a file or paste anywhere. There's still no form, required field or kind picker.
- **Folded away, nothing lost** (rules 12, 17): "Set aside" is one closed row with its count (`SetAsideFold`). Restore, Delete and "Delete all set aside" are one tap inside, with "See all" to the full list at `/home-send?view=archived`. The fold stays mounted after the last item is restored, so "Restored" still shows. "Other ways to send things in" (email address, Add to contacts, Install) is one closed row too.
- **Explanations removed**: the desktop lede, "Added recently"'s intro line, Set aside's paragraph, and the first-time welcome card (`HomeSendWelcome`), whose buttons repeated the WhatsApp icon and Install.
- No safety rule touched: `conversation/consent.ts`, the defaults, Checking for money and health, and health visibility are unchanged.

### Where each thing lives now
Send: on the page. Today's report: under the sentence. Undo: in "Added recently" (one tap to open) and on the "Got it" notice. Restore/Delete/Delete all: inside "Set aside". Email forwarding, Add to contacts, Install: inside "Other ways to send things in". WhatsApp: the icon beside the sentence. Sender trust and every Admin switch: Settings → Connections → Email and Settings → AI Assistant (unchanged).

### Help
`help.guide.home-send.body.12` rewritten for the new layout, and the welcome-card sentence removed from `body.14`, in all eight languages (section `updated` 2026-11-20).

### Verified
tsc, ESLint on touched files, vitest (channels, help, i18n: 107 passed), `lint:help-links`, production build. E2E `screens.spec.ts` "HomeSend is the send box…" was updated for the two buttons and the fold, and passes on mobile and desktop locally. The first run caught the fold dropping "Restored", which `SetAsideFold` fixes.

### For the owner
- The first-time welcome card is gone. Say if new households should get it back as a one-time note.
- "Added recently" is folded by default, so its Undo is one tap away rather than on the page; today's card says what was added.

### Cleanup
Both QA households and users made for the audit were deleted (count 0, users gone); scratch scripts removed; the local server stopped.
