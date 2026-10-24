# HomeSend: a blood-test camp is never a grocery; notes as numbered points

Date: 2026-10-25

## Why

The owner forwarded a lab's flyer, "Blood Test Camp at Splendora CHS", with a list of test prices. The review opened on "A grocery item", marked Suggested. That had two causes:

1. The model's reading. It saw prices and called the flyer a product. Nothing checked that reading.
2. The review's fallback. When the model said `unknown`, the review opened on "A grocery item" anyway and still marked it Suggested, so the picker suggested a category that nothing had suggested.

The owner also asked for the notes to be numbered points.

## What changed

- **A second look at the kind, in code** (`packages/core/src/ai/intake-kind-check.ts`).
  - `reviewIntakeKind` runs first inside `sanitizeIntakeExtraction`, so every provider's reading goes through it.
  - A `grocery_item` whose title, summary, notes or subject names a service or a gathering becomes an `event` at low confidence, so a person always confirms it. Services include a blood/lab/health test, a check-up, a screening, diagnostics, vaccination, a consultation, an appointment or a clinic. Gatherings include a camp, a workshop, a meeting, a session, a festival or a tournament.
  - Grocery-only fields are dropped when the kind changes.
  - It only ever moves a reading away from grocery. "Party" is left out, because party poppers are groceries.
- **What the review opens on** (`suggestedIntakeKind`).
  - It shows the stored kind after the same check, so items read before this change also open right.
  - For an `unknown` reading it suggests an event when the words name a service or a gathering. Otherwise nothing is pre-chosen: the picker opens, no fields show until a category is picked, and Add stays disabled.
  - The old fallback to grocery is gone, in both the inbox and the sheet.
- **The AI's instructions** (`INTAKE_SYSTEM_PROMPT`).
  - `event` now names camps, drives and screening days held for the household to attend.
  - `grocery_item` says a service is never a grocery, even with a price list.
  - A short decision rule (what does it ask the household to do?) maps each answer to a kind.
  - A lab flyer for a camp is an event, never a health document and never a grocery.
- **Numbered notes.**
  - The AI writes "1. …" points, at most ten, one per offer for a price list.
  - `numberedNotes` renumbers whatever marks the model used ("-", "•", "*", "2)"). A single unmarked line stays as written.
  - The notes placeholder reads "1. One point per line" in all eight languages.
- **Help.** `help.guide.home-send.body.4` was updated in eight languages: notes are numbered points, a camp or test is an event, and nothing is pre-chosen when WonderHome can't tell.
- **Evaluation.**
  - Golden case HS-22 replays the owner's flyer with the reading the model actually gave (`grocery_item`) and expects an event.
  - The HomeSend runner applies the same kind check to recorded readings.
  - New unit tests are in `ai/intake-kind-check.test.ts`.

## Verified

- `tsc` passes for core and web.
- `npm run eval` passes 165/165, unsafe actions 0.
- Vitest passes for `ai/intake-kind-check`, `ai/classify-intake*`, `ai/intake-receipt`, `evaluation/` and `apps/web/app/_components`.
- Not browser-checked this time: the owner had just deleted the QA household. The picker's open-when-empty state was browser-checked at 360px in #326.

## Open

- Items already in HomeSend keep the notes they were read with. Their kind is re-checked when the review opens.

## Cleanup

No test data was created.
