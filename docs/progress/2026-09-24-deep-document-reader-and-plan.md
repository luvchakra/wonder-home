# Deep Document Understanding 2.0, part 1: the whole-document reader and the change plan

**Story:** 14-017 (Done). 14-018 and 14-019 queued.
**Spec:** `design/HOMESEND-DEEP-DOCUMENT-UNDERSTANDING-2.0.md`. **Mockup:** `design/HomeSend-Deep-Document-Understanding-Mockup.png`.

## What was asked

"Add this to queue": the HomeSend and HomeTalk Deep Document Understanding 2.0 spec, with a 12-screen mockup. In the mockup:

- a file is uploaded in HomeTalk or HomeSend;
- the processing steps are shown;
- "Found 4 items" spans several domains;
- each item opens to its fields and its source page;
- the person chooses "Review and apply (N)";
- an "All done!" summary follows, or "Updated successfully" for a bill whose amount and due date changed.

The spec breaks the work into phases A–G. This note covers A–C.

## Story split

The spec is split into three stories in backlog 14 (epic 14-E17):

| Story | Phases | Scope |
|---|---|---|
| **14-017** (this PR) | A–C | The whole-document reader and the change plan. |
| **14-018** | D–E | The grouped review, applying, the persisted plan, field-level change history, the exact receipt, partial failure and undo. |
| **14-019** | F–G | HomeTalk attachments through the same plan and receipt; "what did it change?" answered from stored changes; certification. |

## What was built

### 1. Reading the whole document

This is `ai/classify-intake.ts`.

**What the classifier now returns.** Alongside the headline reading, it returns:
- `records[]`: every household-relevant thing across every page. Each date of a series is its own record ("Rehearsals 8, 10 and 13 October" becomes three), and so is each fee and each thing to buy or bring.
- `evidence` on each record: its page, section and quote.
- `pages`: the total, and which pages were unreadable.
- `issuedOn`: the day the document is dated.

**The backstop.** Each record goes through the same deterministic backstop as the headline:
- no ids anywhere;
- no field the record's domain does not own;
- a record left with no name is dropped.

Only a bill, a school item or a grocery item may propose records. A receipt and a health document keep their own flows.

**Dates are WonderHome's.** `groundIntakeDate` resolves each record's own date words in the household's timezone. Only a school item keeps a time of day.

**Other reader changes:**
- Every record's title, notes and quote are scanned for injected instructions.
- A PDF's page count from its bytes is the fallback when the model gives no count.

### 2. Keeping the reading

`homesend/document.ts` keeps the reading on the item's `understanding.document` (jsonb, so no migration):
- the page report, e.g. "7 of 8 pages read — page 4 could not be made out";
- `issuedOn`;
- the records, deduplicated.

An item read before this change still works: its records are derived from the headline and its needs.

### 3. The change plan

`homesend/plan.ts` is pure over records already read. `readPlanContext` reads everything once, through the member's own client.

Each record is resolved for its person through the Wave 1 resolver, reconciled through the existing `reconcileAgainstRecords`, and given exactly one outcome:

| Outcome | Group | When |
|---|---|---|
| create | New | Nothing like it is on record. |
| update | Updates | A record on file needs changing. The change is field by field, e.g. `12 Oct → 15 Oct`, or `₹2,120 → ₹2,430` in rupees (rule 22). |
| cancel | Updates | The document calls it off. |
| no change | Already on record | The same thing is already on file. This is a successful outcome (§27). |
| conflict | Conflicts | The record was changed after the document was written. The record stands (§28). |
| needs your answer | Needs your answer | It is not clear who it is for. One question is asked, and nothing is created until it is answered (§29). |

**Rules on top of reconciliation:**
- **Series.** The same title on several days in one document is a set of occurrences. A record on file for one of those days is that day's, and is never moved to another day.
- **One claim per record.** A record on file answers for one thing in the document. The strongest claim keeps it.
- **Same bill.** A bill with the same amount on the same day, sharing a word in its name ("Parent contribution" and "School contribution"), is the same bill.
- **Enrichment.** A child's school and class come from their enrolment and are marked "From your household records" (§30).

**Wording helpers:**
- `planSummary` gives "I found 6 relevant items: 1 to update, 2 new, 3 already on record."
- `applyLabel` gives "Apply 3 changes", or "Nothing to change".

### 4. Shared fixes the golden scenarios exposed

- **Matcher: parts of an occasion.** A part of an occasion (rehearsal, practice, fee, contribution, registration, audition, costume, form) is never the occasion. "Annual Day rehearsal" had been matching "Annual Day" as the same thing, both through the alias list and through name containment.
- **Matcher: equal verdicts.** These are now ordered by name similarity.
- **School items and bills carry `updated_at`.** It is the context item's `capturedAt`, which "newer record wins" needs. Before this, a school item could never be a contradiction.

## Verified

- **`plan.test.ts`, 26 tests**, including the spec's golden scenarios as permanent regressions:
  - §46 mixed school notice: 1 update, 2 new, 3 already on record, "Apply 3 changes";
  - §47 newer record wins, plus the reverse, where a newer document updates;
  - §48 ambiguous child: the question, an answer, an invalid answer ignored, and the one-child household.
  - Also covered: cancel, a field-level bill update, next month's bill as a new occurrence, a no-op, the per-record backstop, record date grounding, and the page report.
- **Core suite:** 2871 passing. The classify-intake evaluation fixtures were extended with the new fields.
- **`npm run eval`:** 49/49 cases pass, with 0 unsafe actions out of 14, so no golden HomeTalk, HomeSend or HomeBrain case moved.
- **Not browser-verified.** This part changes no screen and no database schema, so there was nothing to QA in a browser and no migration to apply. The review screens are 14-018.

## Open

**14-018:**
- the review from the mockup;
- per-record include, skip, edit and answer;
- apply through the domain services, with verification;
- a persisted plan;
- field-level history on `homesend_changes`;
- the receipt, partial failure and undo.

**14-019:**
- HomeTalk shows the plan and the receipt in the conversation;
- "what did it change?" is answered from stored changes;
- golden scenario 4;
- eval cases and the §50 counts.

**Reading limits that remain:**
- Page reading, OCR and tables are still done by the model reading the PDF. There is no local text-layer extraction and no progressive reading of documents over 40 pages.
- Page numbers in evidence are the model's pointer, shown for a person to check. They are never trusted as more than that.

## Where the code lives

- `packages/core/src/ai/classify-intake.ts`: records, pages, `issuedOn`, and their backstop and grounding.
- `packages/core/src/homesend/document.ts`
- `packages/core/src/homesend/plan.ts` and `plan.test.ts`
- `packages/core/src/context/matching.ts`: parts of an occasion, and name ordering.
- `packages/core/src/school/repository.ts`, `finance/repository.ts` and `context/builders.ts`: `updated_at`.
