# Classic landing refreshed to today's WonderHome

Owner request (2026-11-07): refresh the classic landing variant's content; keep its layout and look.

## Done
- `landing-classic.tsx`: feature grid now 20 cards. Added Family calendar (ICS subscriptions), FamilyChat, HomePlaces, Private by design, Undo; HomeSend, Today, Groceries (All / In Kitchen / To Buy), Bills (Mark paid, never paid for you), Meals and HomeTalk wording refreshed. Child-privacy card now names the adults-only home address.
- `landing/whats-new.tsx` (used only by classic): HomeSend section no longer says "nothing is added until someone confirms". It now says a clear reading is added straight away, unsure ones are marked Checking and settled by a quick question in HomeTalk or WhatsApp, nothing is paid for you, and everything can be undone. The inbox mock shows Added / Checking instead of Confirm.
- Every claim checked against `help/areas/help/en.ts`. Dropped "Settings search" (not in the guide) and "Check in" (not found).

## Not changed, and why
- Classic's words are hard-coded English (the page is English-only, see its header comment), so there are no catalog keys to update or remove; the eight-language catalogs belong to the new landing. SEO metadata is shared (`landing.meta.*`) and was left alone.
- No new client JS, imports are icons only.

## Verified
- `tsc --noEmit` clean; `vitest` page-variant + landing-variant pass.
- NOT verified: ui-check at 360 px / desktop and the hero JPEG. This container has no `apps/web/.env.local`, so the app can't start. `check:bundle` was not run.

## Open
- Owner or a session with env: switch to Classic (Platform admin → Landing page), glance at 360 px, switch back to New.
