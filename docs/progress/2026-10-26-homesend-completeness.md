# HomeSend asks what an entry still lacks (story 14-041)

**Date:** 2026-10-26 · **PR:** #363 · **Owner's ask:** "HomeSend should be able to deeply analyse the structure of entity to be added and ask relevant questions to ensure entry added has complete info."

## What was done and why

The gap: "Add 2 litres of oil" became "Coconut oil" with no quantity; events arrived with no day, bills with no due date, and nothing said so. Only "Who is it for?" was ever asked.

- **What makes an entry complete** — `packages/core/src/homesend/completeness.ts`, pure, derived from what each create in `home-send-writes.ts` takes. Required (cannot be added without) and useful (asked once):

  | Kind | Required | Useful |
  |---|---|---|
  | grocery_item | name | quantity + unit |
  | school_item | child, title, due date | — |
  | activity_item | child, class | day |
  | event | title, day | start time, where |
  | bill | payee, amount, due date | — |
  | health_document | person, record type | date |
  | receipt | shop, date | — |

  Each detail carries one short question in the UI's words and the review input it fills.
- **The reading's own evidence first** — `fillFromEvidence` runs in `ingest.ts` before the understanding is built: a grocery reading with no quantity takes the one quantity-with-unit the text sent states ("2 litres" → 2 l). Two amounts, or a bare number, stay missing; nothing is guessed.
- **Nothing added while incomplete** — `confirmation.ts` computes the missing required details; a kind that may add on its own now asks the first one instead (`mode: "ask"`). Bills, health documents and receipts still always wait (`govern`), now with the question beside the hold.
- **WhatsApp, one question at a time** (`whatsapp/intake.ts`). After ingest: who it is for first (existing flow), else the first missing detail. The item keeps `extracted.asking` (`awaiting`, `asked`). The next short reply (or a swipe-reply) is read as that detail by `completeness-answers.ts` (quantity + unit via `commerce/units`, a date phrase via the intake's `dayFromDateText`, a time, an amount, a record-type choice, or a few words; "skip" passes). Then the next detail, at most three per item; with nothing left to ask, `addOnItsOwn` runs (Pre Approved and above the bar) or it says it waits in HomeSend and what is left to fill there. A swiped reply that can't be read is asked again; an unswiped one falls through to the usual flow. Replies never say an amount, health detail or number back. HomeTalk's own clarify routing (#360) runs first and is unchanged.
- **App review** (`_components/home-send-intake.tsx`): "Still needed: Amount, Due" above the fields, read live from the form; empty fields are marked (`data-missing`, `aria-invalid` for required) and Add / Add anyway / Add as new stay off while a required one is empty. Server side, `createNew` refuses a post without a required detail, and a receipt needs its shop. Payee, Amount, Due and Shop lost their "(optional)" in all eight languages.
- **Help**: `help.guide.home-send.body.7` in all eight languages; keywords "still needed", "missing", "quantity".

## Verified

- Unit: `completeness.test.ts` (per kind, ordering, the three-question cap, every answer type, evidence), `confirmation.test.ts` (two fixtures given a due date, since an undated school item is now asked; new cases for event, bill, grocery), `whatsapp-intake.test.ts` (ask → answer → next question → added or waiting; skip; the cap; no amount echoed; swiped and unswiped unreadable replies; who-for then the next detail). 116 passing across those files.
- `npm run eval` (deterministic): 179/179, Unsafe Action Rate 0/23, every blocking gate passes. New cases HS-29 (due date), HS-30 (class), HS-31 (amount), HS-32 (record type), HS-33 (day), HS-34 (shop), HS-35 (quantity from the text).
- Typecheck (core and web), ESLint on the changed web files, `lint:help-links`.
- E2E `e2e/screens.spec.ts` against the live project: a bill with no amount or due date shows "Still needed", marks Amount, and Add turns on only once both are filled. Its household and user are created and deleted by the spec.

## Open

- Free-text answers on WhatsApp (a payee, a shop, a class name) are taken as written; the review still shows them before anything is added unless the household's bar allows otherwise.
- A provider run (`--provider configured`) was not repeated for this PR: the change is after the classifier, and the deterministic run covers it.

## Cleanup

No QA accounts or rows were created by hand; the E2E spec seeds and deletes its own household and user.
