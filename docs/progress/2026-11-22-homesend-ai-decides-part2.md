# HomeSend: the model decides, part 2 — kinds nobody anticipated (14-082)

**Why.** The owner, 2026-11-22: "new kind, unseen incoming messages should be analysed by ai". Design: `docs/design/2026-11-22-homesend-ai-decides.md`.

**What was done.**
- `ai/classify-intake.ts`: the reading gains `whatIs` (any kind), and for kind `unknown` only, `newKind` and `operations` (note, event, reminder, to_buy, task, contact, place; title, notes, dateText as written, person as written, quote, confidence). The prompt says never pay, order, message, book, cancel or share. Kept only when present, so older readings keep their shape; any value carrying an id is dropped.
- `homesend/decision.ts`: `decisionFromModel` (source `model`; days grounded by WonderHome from the copied words; the notice is always kept as a note of its new kind), `datedOperations`, `newKindSentence` ("This looks like a society maintenance notice. I'll add the 30 Nov water shutdown to the calendar and keep the society notice as a note.").
- `ingest.ts`: the model's decision for a new kind, else today's reading as one; validated either way; the notice says plainly what HomeSend will do.
- `homesend/new-kind.ts` `recordNewKindDays`, called by the Nothing-waits runner (`hometalk/needs-you-run.ts`) just before a note is kept: each accepted event or reminder goes on the calendar through `addFamilyEvent` (same-day duplicates said back, not added), with a `homesend_changes` row for Undo, confirmed above the household's event bar, else Checking (`auto.source = "ai_decision"`).
- Help "HomeSend" ¶21 in all eight languages; section `updated` 2026-11-22.

**Verified.** Vitest homesend, hometalk, ai, evaluation, whatsapp: 96 files, 1,638 pass (4 new for new kinds). `npm run eval` deterministic 489/489, unsafe 0/82. Core and web typecheck clean; help tests and links pass.

**Not verified live.** No model key in this container: whether the provider fills `newKind`/`operations` well is unmeasured. The first live run should send a society notice and a warranty card (`npm run eval -- --utterance …`); eval cases for unseen kinds come with 14-085.

**Open.** Grouping by new kind and Platform admin's candidates (14-085); to_buy, task, contact and place operations from a new kind are recorded in the note, not yet executed. No migration; no test data created.
