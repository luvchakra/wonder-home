# Answers to pick under HomeTalk's questions (14-052)

**Why.** The owner, 2026-10-26, about "First, Coconut oil: How much should I get? For example 2 litres or 1 kg. (Say "skip" to leave one for later.)": "instead of receiving answers in text, why don't you give easy contextual answers to pick from". Design principle 20. The same screenshot showed an "ACTION PREVIEW · Done … Can be undone" card under that question.

## What was built

- **Choices on the question** (`packages/core/src/hometalk/choices.ts`). A reply that leaves a question open carries `metadata.choices`: `{ mode: "single" | "multi", choices: [{ label, say }], also?, health? }`. `label` is in the member's language (`hometalk.choice.*`, eight languages, new `choices` area); `say` is the English the clarify step already reads. A pick is an ordinary turn, so grounding, consent and every gate run unchanged.
  - Amount: 2–3 practical amounts from the catalog by the one rule for amounts (`commerce/bare-amount.ts`, 25-037, #373): litres for a liquid, kilos for a staple, the pack for a small weighed thing, pieces or the item's own word for counted things (`choice-amounts.ts` looks the item up). Then Skip, or That's enough when it is already on the list; "1 of each"/"2 of each" for several items.
  - Who (candidates, else the household's names), a day (Today, Tomorrow, the next weekend day, Another day…; Today, Yesterday for a receipt or health document), a time (9 am, 12 pm, 4 pm, 6 pm, Another time…), a record type, yes / not now, which item (candidates).
  - Multi-select: the offer to fill in waiting HomeSend items lists them as checkboxes (all ticked) with one Send and Not now; "Maths worksheet and Diwali dinner" fills in just those (`clarify.ts` `offeredItemsNamed`, longest titles first so "Bread and butter" stays one; the offer now carries the titles).
- **App** (`apps/web/app/ai/assistant.tsx`, kit `ui/answer-choices`). Chips in a `radiogroup` (arrows move focus only; Enter/Space or a tap picks) or `ChoiceChips` checkboxes plus Send. Only the latest message's are live; earlier ones stay greyed. "Another day…" focuses the composer. The composer always stays. `ChoiceChips` checkboxes now show a check as well as the fill (rule 3).
- **WhatsApp** (`notifications/whatsapp.ts` `interactiveMessage`/`sendWhatsAppChoices`, `whatsapp/intake.ts` `openChoices`, `whatsapp/inbound.ts`). Reply buttons for 3 or fewer, a list for up to 10 (pick button in the member's language); each id is `say:<words>` and a pick comes back as those words. Falls back to plain text when the send fails, a label would be cut, or the body is too long. A health record's choices are never sent. No question about money has choices.
- **Voice** unchanged: the question is spoken, never the list.
- **No preview card on a question** (`onlyAsked`): `fill_homesend_details`, and `complete_homesend_item` that only asked the next question, show no Done card and no ✅ (the warmth from #374 now treats them as questions). Kept on reload via `metadata.questionOnly`.
- **Defect the eval caught** (HT-167): `normaliseUtterance` dropped the "now" of "not now" as a polite tail, so "not now" was never read as an answer. The tail rule now keeps it (`normalise.ts`).

## Verified

- Unit: `hometalk/choices.test.ts` (choice sets per question, every `say` round-tripped through `answerClarification` and `readDetailAnswer`, normalising never changes a `say`, multi-select combined answer, amounts, stored-choice reading, `onlyAsked`), `notifications/whatsapp-choices.test.ts` (buttons, list, limits, text fallback, inbound picks), `whatsapp-intake.test.ts` (buttons on HomeTalk's question; a health record's as text), `ui/answer-choices.test.tsx`, `normalise.test.ts`. Related suites: 1,742 pass. The unit question from 25-038 (#376, "1 bottle", "2 bottles", "Count it in litres instead") is offered as chips too.
- Eval: HT-162–HT-168 pass; full deterministic eval 204/204, Unsafe Action Rate 0.
- Signed-in E2E (`e2e/screens.spec.ts`, mobile and desktop, live project): latest question's chips enabled at ≥ 44 px, an answered one's greyed, no "Can be undone" card on a question-only turn, no overflow at 360 px. Whole spec 20/20.
- Browser, production build with a service role on the live project, throwaway account: "Add coconut oil to the groceries" → 1 bottle / 2 bottles / 3 bottles / That's enough → tapped "2 bottles" → added (+2 bottles); "Remind me to call the plumber" → Today / Tomorrow / Saturday / Another day… → "Tomorrow" → reminder for Tue 27 Oct 9 am; the offer with two waiting items → unticked one, Send → "First, Coconut oil: How much should I get?" with amount chips and no preview card. 360 px and 1280 px, no horizontal overflow, arrows move focus without sending.
- Typecheck, ESLint on changed files, import boundaries, help links, bundle check, production build.

## Cleanup

QA account `e171d9b8-3348-41bd-9183-c6b2030d53f1` and household `d0cf285c-2ef0-42c0-a865-58456e99f8eb` (with its two seeded HomeSend items and conversation) deleted; counts confirmed 0. The E2E spec deletes its own household and user. No server left running; scratch scripts were in the scratchpad.

## Open

- Interactive WhatsApp messages are untested against the live Cloud API (no business number configured); the fallback to text covers a refusal.
