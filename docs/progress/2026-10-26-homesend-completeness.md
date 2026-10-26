# HomeSend reports what an entry lacks; HomeTalk asks (story 14-041)

**Date:** 2026-10-26 · **PR:** #363

**Owner's ask:** "HomeSend should be able to deeply analyse the structure of entity to be added and ask relevant questions to ensure entry added has complete info."

**Then, before merge:** "why would HomeSend ask a question, isn't that HomeTalk's job" → "ok. strictly implement this design."
1. HomeSend never words or sends a question; it only reports what's missing.
2. HomeTalk asks every question, in the app and on WhatsApp, through its clarify machinery.
3. HomeTalk hands the answers back to HomeSend, which adds the entry or waits, per autonomy and the bar.
4. The HomeSend-side "Who is it for?" WhatsApp question is folded into HomeTalk.
5. The app's review form keeps "Still needed" and blocks Add.

The first version of #363 had HomeSend asking on WhatsApp itself. The design change arrived while it was open: auto-merge was turned off, nothing of that version merged or went live, and it was reworked in place.

## What was done and why

The gap: "Add 2 litres of oil" became "Coconut oil" with no quantity, events arrived with no day and bills with no due date, and nothing said so.

### HomeSend: what makes an entry complete
`packages/core/src/homesend/completeness.ts` is pure, derived from what each create in `home-send-writes.ts` takes, and words no question. Required details cannot be added without; useful ones are asked once:

| Kind | Required | Useful |
|---|---|---|
| grocery_item | name | quantity + unit |
| school_item | child, title, due date | — |
| activity_item | child, class | day |
| event | title, day | start time, where |
| bill | payee, amount, due date | — |
| health_document | person, record type | date |
| receipt | shop, date | — |

- **The content's own words first:** `fillFromEvidence` runs in `ingest.ts` before the understanding is built. "2 litres" in the text sent fills a lost quantity. Two amounts, or a bare number, stay missing.
- **Reports, never asks:** `confirmation.ts` returns `stillNeeded` (labels). Nothing is added on its own while a required detail is missing. Bills, health documents and receipts still always wait.

### HomeTalk asks every question
`packages/core/src/hometalk/intake-questions.ts` holds every word of every question.
- **Opening the question:**
  - In the app: telling HomeTalk about something new (`file_with_homesend`) ends with the first question, left open on the reply.
  - On WhatsApp: after HomeSend reads a message, `openIntakeQuestion` records HomeTalk's question in the member's WhatsApp conversation (`surface: "whatsapp"`). The acknowledgement is what HomeSend found plus HomeTalk's question. Without HomeTalk wired in, nothing is asked.
- **Who it is for** is one of those questions, with the household's names as choices. The old HomeSend-side `whoForChoices` / `answerWhoFor` are gone.
- **Reading the answer:** it is HomeTalk's own open question (`metadata.clarify`, action `complete_homesend_item`), so the next turn is read as its answer by `conversation/clarify.ts`.
  - The reply is taken only when it reads as the detail asked, or as "skip"; anything else is a fresh request.
  - On WhatsApp, the #360 routing sends the reply to HomeTalk when the open question is about the item just sent, and never after a newer item.
  - Values are read by `hometalk/detail-answers.ts`: quantity and unit via `commerce/units`, a date via the intake's `dayFromDateText`, a time, an amount, a record type, a few words, or a name.
- **Handing back:** the executor puts the answer on the item (as the member; RLS decides), then asks the next question (at most three per item) or hands the item back to HomeSend. `addIfAllowed` (`home-send-auto.ts`, shared with the WhatsApp path) adds it only where the household allows (Pre Approved and above the bar); otherwise it waits and the reply names what is left to fill in. A value is never said back.
- **New action wiring:** `complete_homesend_item` has a REPLY_CLASSES entry (none: nothing is said back), consent level `draft`, and capability `homesend_details` (everywhere, `ACTION_SCOPE "none"`, like `set_preference`). It only fills in the member's own item, which still waits in HomeSend; no domain table is touched.

### App review form
`_components/home-send-intake.tsx` shows "Still needed: …" read live from the form, marks those fields (`data-missing`, plus `aria-invalid` on required ones), and keeps Add / Add anyway / Add as new off while a required one is empty. `createNew` refuses a post without one, and a receipt needs its shop. Payee, Amount, Due and Shop lost "(optional)" in all eight languages.

### Help
- `help.guide.home-send.body.7`: HomeSend says what's missing, HomeTalk asks.
- The WhatsApp line in `connections.body.3`: "HomeTalk asks you right there" replaces "swipe to reply with their name".
- All eight languages; both sections' `updated` dates set.

## Verified

- **Unit:** 1,900 pass across conversation, voicelink, evaluation, homesend, whatsapp, hometalk, notifications, i18n and help.
  - `completeness.test.ts`, `confirmation.test.ts` (reports `stillNeeded`, never a question).
  - `hometalk/intake-questions.test.ts`: the question wording; who-for with choices; the clarify reading taking an answer and rejecting a new request; ask → answer → next → hand back; the cap; no amount said back; the WhatsApp question recorded as HomeTalk's.
  - `hometalk/detail-answers.test.ts`.
  - `whatsapp-intake.test.ts`: HomeTalk asks after ingest; nothing is asked without HomeTalk; a reply goes to HomeTalk and never into HomeSend; a question about another item never takes a reply.
- **Eval:** `npm run eval` 187/187, Unsafe Action Rate 0/23, every blocking gate passes (voice: 32/32 actions placed).
  - HS-29–HS-35: "Still needed", and that HomeSend words no question.
  - HT-143–HT-150: HomeTalk reads a quantity, a date, an amount, a person, a record type, a place and "skip" as answers, and a new request as that request.
- **Checks:** typecheck (core, web), ESLint on the changed web files, `lint:help-links`, build and `check:bundle`.
- **E2E** `e2e/screens.spec.ts` on the live project: 18/18 mobile and desktop on the first version, including the "Still needed" bill case. The review form is unchanged since; the spec seeds and deletes its own household.

## Open

- A provider run (`--provider configured`) was not repeated: the model's reading is unchanged, and the new turns are read by rules.
- Free-text answers (a payee, a shop, a class, a place) are kept as written; the item still waits for review unless the household's bar allows otherwise.

## Cleanup

No QA accounts or hand-inserted rows. The E2E spec creates and deletes its own household and user.
