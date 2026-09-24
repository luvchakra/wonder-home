# Deep Document Understanding 2.0, part 3: HomeTalk and certification

**Story:** 14-019 (Done). With it, Deep Document Understanding 2.0 (14-017..019) and module 14 are complete. **Spec:** `design/HOMESEND-DEEP-DOCUMENT-UNDERSTANDING-2.0.md` §31–33, §45–50.

## What was built

### HomeTalk attachments use the same pipeline

HomeTalk's paperclip already opened the HomeSend sheet. That means:
- ingest, the document reading, the plan, the apply step and the writes are the same code as HomeSend's screen;
- there is no second parser.

What was missing was the conversation:
- **Posting the result.** Once a plan is applied from the sheet, the assistant posts `{ documentReceipt: itemId }` to the conversation route.
- **Where the words come from.** The new `documentReceipt` turn in `_lib/hometalk-turn.ts` reads the item through the member's own client. It records an assistant message built by `homesend/talk.ts`'s `documentReplyText` from the stored receipt, for example: "I read the 2-page school notice and found 7 things… Done. Updated: • Annual Day — 12 Oct → 15 Oct …".
- **Duplicates.** The message is idempotent per document.
- **Language.** The reply carries its content classes (financial for a bill, child for a school item) into the reply-language gate.

### "What did the school notice change?"

`readDocumentChangeQuestion` reads the question by rules. It only fires when the question names a document ("notice", "PDF", "bill"…), so "what did Asmi change?" is not caught.

`answerDocumentChanges` then answers from the newest applied document whose words match, using only its receipt and the `homesend_changes` rows:
- a change someone has since undone is said to be undone, and never repeated as if it still held;
- "already on record" counts and failures are said too;
- when no applied document fits, the question goes on to HomeBrain like any other.

The shortcut is not used over a voice link (Gemini, Alexa). Those take the HomeBrain path, which applies the channel's content limits.

### Certification

- **Golden scenario 4** (§49) is in `talk.test.ts`: the same reading gives the same plan whichever door it came through.
- **Eval case HS-16:** "Science project registration form" is new, never the Science project again. It guards the part-of-an-occasion matcher fix from part 1, and the eval is 50/50 with 0/14 unsafe.
- **§50 counts** are in HomeSend metrics (`documents`), counts only:
  - documents applied;
  - receipt outcomes;
  - plan changes still standing;
  - the primary measure: correct household changes per document.

### Also

- **An open question is said.** A receipt with a question still open now says so ("1 change applied, 1 waiting on your answer") instead of "All done!".
- **Created lines say who and when,** so two rehearsals read as two.

## Verified

- **Unit tests:**
  - `talk.test.ts`: 8 tests;
  - apply: 9 (open-question headline);
  - metrics: 8 (document counts);
  - HomeSend overall: 341.
- **Eval:** 50/50, with 0/14 unsafe.
- **Browser QA** at 360px and 1280px, on the seeded QA household from part 2, with no horizontal scroll:
  - the plan was applied in HomeSend (answered "Manan", four changes);
  - the receipt was posted into HomeTalk (the `documentReceipt` turn returned 200 and showed in the conversation);
  - "What did the school notice change?" was typed in the composer. The answer was "The 2-page school notice moved Annual Day from 12 Oct to 15 Oct, added Annual Day rehearsal (Asmi · 10 Oct), added Annual Day rehearsal (Asmi · 13 Oct) and added Maths assessment (Manan · 2 Oct). 3 things were already on record."

## Open

**Can't be run in this environment:**
- A real model reading of a multi-page, scanned or table-heavy PDF through the paperclip needs a model key. The reader, plan and apply are covered by tests and by the seeded QA scenario.
- `npm run eval -- --provider configured` needs the same key.

**Deferred from the spec:**
- local text-layer extraction;
- progressive reading past 40 pages;
- adding an unknown child from inside a multi-record plan;
- merging fields other than date, time and amount into an existing record.

## Cleanup

The QA user `163f8cda-ecb7-4092-9164-df6a69bfbae3` and household `b4206815-9e3e-4fdb-804b-70762342064f`, with every record seeded or created in it, are removed after the merge. See the cleanup line added to this note.
