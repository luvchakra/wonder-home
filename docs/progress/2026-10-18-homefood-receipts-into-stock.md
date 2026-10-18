# HomeFood: receipts into stock (25-003b), and family facts by voice

2026-10-18.

## What was done

**Receipts change what is at home and what is on the list** (design `GROCERIES-PANTRY-HOMETALK-PHASE0.md` §3.8, §6).
- **The rule is pure.** `commerce/receipt-stock.ts` works out, for each kept line:
  - `receiptStockLine` gives what is at home before → after and what comes off the list, in the item's own unit. It never converts across dimensions: a pack of something kept in grams adds nothing, and the line says why.
  - **Add to what's at home** is on by default. It is off when a person counted the item after the receipt's day. Only a stated or corrected count matters; a purchase, a receipt or an undo moves the row's time but is nobody counting.
  - **Take it off the list** is on when the item is waiting there.
  - `duplicateReceipt` matches a receipt already recorded with the same shop, day and total. All three must be known.
- **The review** shows both checkboxes on every line, with the amounts before and after. A duplicate gets an amber notice and a **required** "Record it again" tick.
  - The tick is required because a server refusal comes back after React has reset the form's uncontrolled fields. A browser check found this: the kind jumped to "A bill" and the line matches changed.
- **The server** (`routeReceipt` in `home-send-actions.ts`):
  - It works out each line again from what is on record. The browser sends only the two choices.
  - It writes through `changeStock` and `adjustListEntry`, with keys tied to the purchase (`hsr:` and `hsl:` plus the purchase id).
  - The duplicate check uses the reading, so the warning shown and the check here are the same check.
- **Undo** of a receipt line reverses its stock change and its list change, found by those keys (`recordedChange`), before removing the purchase. An item no longer tracked is passed over, not a blocker.

**Telling WonderHome what someone likes works by voice.** The owner's screenshot showed Gemini Live answering "I can't update that information from this voice assistant" to "Manan likes home-cooked food…".
- **The cause.** `set_preference` sat in the app-only `household_admin` capability, next to delegation and agent runs.
- **The fix.** It now has its own capability, `family_facts`, available everywhere, with a Gemini tool `remember_family_fact` (one fact per call, naming the person).
  - It needs no voice scope: a fact is kept as learned, never certified, and is correctable in HomeBrain Review.
  - The voicelink test that listed it as never-by-voice now says the opposite, because the owner asked for it.
- **Typed paragraphs** with several facts and a "he" are not split yet. That is follow-up H-4.

**A correction to the earlier note** (`2026-10-18-owner-decisions-invite-email-child-health.md`): the real invite email was sent on production after #219 merged. GoDaddy accepted it and the sheet said "Sent to connect@wonderapps.biz".

## Verified

- **Unit tests:** `receipt-stock.test.ts` (10), commerce (126), voicelink, conversation and HomeTalk (599).
- **Eval:** `npm run eval` passes 113/113. The voice gate reads 18/18 Gemini tool sentences as their action, including three new family facts.
- **Static checks:** typecheck, lint and `lint:help-links` pass, and the local production build succeeds.
- **Browser check** against the live project, at 360px and 1280px, with a QA household (deleted afterwards and counted 0). The household had milk at 500 ml with 2 L on the list, rice counted after the receipt, and bread not tracked.
  - **The review** said:
    - Milk: 500 ml → 1.5 L at home, and 2 L → 1 L on the list;
    - Rice: not added, with the reason;
    - Bread: not recorded → 1 pack.
  - **Recording** wrote exactly that.
  - **Undoing Milk** put back 500 ml and 2 L, and removed the purchase.
  - **The same receipt sent again** was flagged. Submitting unticked was blocked; ticked, it was recorded.

## Still open

- **25-003c** (use-soon wording) and **H-4** (typed paragraphs of facts).
- **25-006**, the owner's shared grocery catalog with pictures and nutrients, is next in the queue.
- **React's form reset** after a server-side refusal still affects other HomeSend review errors. The duplicate path no longer depends on a refusal, but a general fix belongs to the review form itself.

## Where it lives

- `packages/core/src/commerce/receipt-stock.ts`, `packages/core/src/commerce/inventory.ts` (`recordedChange`), `packages/core/src/homesend/repository.ts` (`listRecordedReceipts`)
- `apps/web/app/(auth)/home-send-actions.ts`, `apps/web/app/_components/home-send-receipt.tsx`, `apps/web/app/_lib/homesend-labels.ts`
- `packages/core/src/voicelink/{capabilities,scopes,gemini-live,readiness}.ts`
