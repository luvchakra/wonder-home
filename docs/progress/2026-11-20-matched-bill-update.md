# Nothing stuck: a matched bill updates by default, an old waiting bill is recorded (2026-11-20)

## Why
The final check of "Nothing stuck in review" (PRs #545–#553) found bills that waited for ever. Record first never adds a bill, receipt or health document that matches one on record. `deadlines.ts` `endingFor` returned `wait` for those three kinds. So a bill like that got no Needs-you question and no default. The owner chose the default for "Update the existing bill?": **"update"** (2026-11-20).

## What changed
- **"Update the existing bill?"** (`homesend_update`, `deadlines.ts` `updateQuestion`). It is asked when a waiting bill matches one on record with a newer amount or date. The answers are Update and Keep as is, and the default is **Update** after 24 h.
  - Update (`homesend/matched-update.ts` `applyMatchedUpdate`) goes through `updateObligation`, the write a person's Update uses. It is recorded as an `updated` HomeSend change with what it replaced (Undo), and audited `homesend.matched_update`. A default's update is `unconfirmed` (Checking, "check before paying", reminders on). A person's own Update is confirmed.
  - Keep as is sets the copy aside `already_recorded`.
  - A cancellation is offered as Cancel it or Keep as is. Its default (`keep_checking`) keeps the bill and marks it Checking, with the note `said_cancelled_kept`. Only a person's tap cancels, and nothing is ever deleted or paid.
  - The match is read again when the answer is applied (`reconcile.ts`). The item is claimed by compare-and-swap first.
  - The question is asked of the sender when they are an Admin, otherwise of the Admins.
- **The same one again** (a bill or health document with nothing new) gets the existing duplicate question. Its default keeps what is on record.
- **A waiting bill that matches nothing.** In a household that records money directly, it is recorded now as Checking (`recordWaitingBill`), as record first would have done.
  - **This is what actually held the two live bills.** Both were sent before record first shipped (26 Oct and 8 Nov). Neither matches a bill on record: one household has no bills, and the other has only an Electricity bill while the stuck item is a Water bill. Both households now record bills directly.
  - A bill missing its amount or due date, or a document with several records, stays with a person.
- The words for the question, its answers and its default are in all eight languages, and so is a help paragraph (HomeSend, body 9). The audit catalog has `homesend.matched_update`, and the rule text is in CLAUDE.md and `docs/agent-platform.md`.

## Verified
- `deadlines.test.ts` and `needs-you-run.test.ts` (in-memory end to end: a matched bill updated and marked Checking, never a second bill; an unmatched one recorded and then asked "Looks right?"). Also `test-spec.test.ts` (X-003) and `security/injection.test.ts`.
- Eval HS-90–95 plus NY-01, NY-05 and HS-55: 9/9 pass.
- A read-only check on live, before the change: 2 classified bills waiting in 2 households, no questions. Both resolve to "record as Checking" under the new rules: nothing missing, a single record, and the households record bills directly.

## Open
- The one-time pass is the deadlines clock itself (every ten minutes once deployed). The after-count is in the PR thread and the coordinator report.
