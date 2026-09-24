# Deep Document Understanding 2.0, part 2: review, apply and the receipt

**Story:** 14-018 (Done). **Spec:** `design/HOMESEND-DEEP-DOCUMENT-UNDERSTANDING-2.0.md` §22–27, §36–38, §42–44. **Mockup:** `design/HomeSend-Deep-Document-Understanding-Mockup.png` (screens 3–7).

## What was built

### The review

`apps/web/app/_components/home-send-plan.tsx` is the review. A document with two or more records is reviewed as its change plan, both in HomeSend's inbox and in the HomeTalk paperclip sheet. The one-item confirm form stays for everything else, and a "Fill it in by hand instead" link sits under the plan.

- **Header.** It reads "Found N items", followed by the document's one-line summary and the pages read.
- **Groups.** Updates, New, Already on record, Conflicts, then Needs your answer.
- **Rows.** Each row shows the domain tile, the name, one line of why, and a badge that says the outcome in words.
- **Opened row.** The chevron opens a row to:
  - the change as before → after, shown once;
  - the fields;
  - the values taken "From your household records" (school, class);
  - the source page and quote;
  - an include switch;
  - an Edit option (name, date, and amount for a bill);
  - for an unplaced record, the "who is it for" choice, with "Not sure — leave it for now".
- **Apply button.** It reads "Review and apply (N)", where N counts only what would actually be written. When there is nothing to write, it reads "Nothing to change — mark as handled".
- **Edits survive closing a row.** They are held in state, so closing a row never drops them.

### Applying

`apps/web/app/(auth)/home-send-plan-actions.ts`, `applyDocumentPlanAction`:

- **What the browser sends.** Only choices: include, `answer.rN` and `edit.rN.*`.
- **The server rebuilds the plan.** It uses `planFor` in `home-send-review.ts`, on the member's own client, from the stored reading and what is on record now. So a record changed since the review is reconciled again, never overwritten by a stale plan.
- **Writes go through the domain services.** Each included record goes through `createNew` / `reviseExisting`, which moved into the server-only `home-send-writes.ts`. That file is deliberately not `"use server"`, so no write helper becomes a callable endpoint.
- **Updates are verified.** Each update is read back and compared (due date, amount, local day).
- **Every write is recorded.** It becomes a `homesend_changes` row with `plan_key`, `fields` (before/after) and `evidence` (page, section, quote).
- **The item keeps the exact plan and receipt.** They are stored in `home_send_items.plan` / `.receipt`, with the review outcome in closed words.
  - Something written routes the item.
  - Nothing new sets it aside as kept.
  - Only an unanswered question, or only failures, keeps it in review.
- **Applying twice returns the stored receipt.** Nothing is written twice.
- **Corrections are evidence.** A person's edits are recorded as correction evidence (`ai_corrections`), the same as other HomeSend review edits.
- **No auto-apply.** A document with a plan never applies on its own, whatever the autonomy setting.

### The receipt

`packages/core/src/homesend/apply.ts`, `applyDocumentPlan`:

- **Writers are injected**, so the rules below are unit-tested.
- **Every record gets an outcome:** created, updated, cancelled, unchanged, skipped, needs_clarification or failed.
- **The overall status is one of:**
  - completed;
  - partial, which is never reported as done;
  - failed;
  - needs_review;
  - no_change, shown as "Nothing new found. No records changed."
- **Refusals are plain.** A domain's `ApiError` message is shown; anything else becomes the domain's plain line, such as "Bills did not accept it."
- **A write that lands but cannot be recorded for undo** is still reported as written, with that reason.
- **`receiptText` gives the §32 wording.** For example: "Done. Updated: • Annual Day — 12 Oct → 15 Oct … Nothing else was changed." HomeTalk will use it in 14-019.
- **"All done!" screen.** It lists every record, with "Undo all N changes" and Done.
- **`undoHomeSendDocumentAction` reverses every live change of a document** through `reverseChange`, which was extracted from the single-change undo. It says honestly if any change could not be reversed.
- **History names each change.** "Recently handled" now shows each change by name ("Added: Annual Day rehearsal · Asmi · 10 Oct"), instead of "Also added to Groceries".

### Also in this PR

- **Migration.** `20261005090000_homesend_document_plan_receipt.sql` was applied live. It adds `plan`, `receipt`, `plan_key`, `fields` and `evidence`. Existing RLS covers them.
- **Newer record wins, refined.** A document's own date now counts as the end of that day, capped at when it arrived. So a notice dated today is not "older" than a record edited earlier today. There is a new test for it.

## Verified

- **Unit tests.** `apply.test.ts` has 8 tests:
  - writes once and records each;
  - skipped;
  - conflict, no-op and question are never written, even if the browser includes them;
  - partial failure;
  - plain refusal;
  - a write that could not be recorded;
  - a no-op;
  - the receipt text.

  `plan.test.ts` now has 27. Typecheck and lint are clean, and `verify:live` passes 218/218, including the five new column probes.
- **Browser QA on a live QA household,** at 360px and 1280px with no horizontal scroll. There is no model key in this environment, so the item was seeded with golden scenario 1's reading, plus a Maths assessment naming no child.
  - **The plan grouped as expected:** 1 update, 2 new, 3 already on record, 1 needs your answer.
  - **Applying worked:** answering "Manan" and applying gave "All done! 4 changes applied".
  - **The database agreed:**
    - Annual Day moved from 12 to 15 Oct;
    - the 10 Oct rehearsal was created with its 15:00–16:30 time;
    - the 13 Oct rehearsal and Manan's Maths assessment were created;
    - each change row carries its plan key, fields and page;
    - the item was routed, with a completed receipt.
  - **Conflict path:** after a reset that re-edited Annual Day, the plan showed it as "changed after the document was written" and did not touch it.
  - **Undo path:** "Undo all 3" cancelled the three created items, and the item was marked undone.
- **Found and fixed during QA:**
  - the update's date was shown twice;
  - the value column was too narrow at 360px;
  - "Fill it in by hand" and "Not worth adding" still showed after applying;
  - history called school changes "Also added to Groceries".

## Open

**14-019:**
- a HomeTalk attachment shows the plan and the `receiptText` in the conversation;
- "What did the school notice change?" is answered from `homesend_changes`;
- golden scenario 4;
- eval cases;
- the §50 counts.

**Also not done yet:**
- An unknown child named in a multi-record notice can't be added from inside the plan. The single-item form still offers that, and the plan offers "Fill it in by hand instead".
- Updates change only the date, time and amount. Other fields are shown but not merged into an existing record.
- A real model reading of a multi-page PDF has not been exercised here, because there is no key in this environment.

## QA data

- QA user `163f8cda-ecb7-4092-9164-df6a69bfbae3`.
- Household `b4206815-9e3e-4fdb-804b-70762342064f`, with its seeded records.

Both are removed after the merge (see the follow-up note on this file).
