# Grocery catalog — pilot test plan

**Status:** Phase C proposal. These are the checks the pilot import must pass before any household sees the catalog. The thresholds are the brief's own proposals. Every reported figure will be an observed count out of a count, never an estimate.

## A. Data gates (run on the dry-run diff, before Stage 3)

| # | Check | Pass when |
|---|---|---|
| A1 | Every catalog item has a unique stable id, a canonical name, a category and a valid `units.ts` default unit | 100% (n/n) |
| A2 | Every source-derived row has a `source_records` provenance row with a licence and a rights status | 100% |
| A3 | No row from a `research_only` or `blocked` source is linked to an approved item | 0 rows |
| A4 | Ambiguous nutrition matches auto-approved | 0 |
| A5 | Food nutrition attached to a `household_nonfood` item | 0 (also enforced by trigger) |
| A6 | An approved nutrition link whose `food_state` differs from the item's and is not marked `approximate` | 0 |
| A7 | One normalized verified alias on two items | 0 unresolved (each one is a review task) |
| A8 | Duplicate items (same canonical name, state and variant) | 0 |
| A9 | A rerun of the importer with the same source versions | 0 changes (idempotent) |
| A10 | Rollback of a batch | Leaves master tables as they were, and every household link set to null rather than broken |

## B. Resolution test: 200 everyday items, reviewed by a person

- **The set:** a 200-item household shopping list, weighted to a weekly Indian basket. The research audit drafts one (`findings/test-items-200.csv`); a person reviews it before it is used.
- **The question for each item:** does a search resolve it to a *sensible* catalog item? Judged by a person.
- **Target:** at least 95%. The **actual observed rate** is reported, with every miss listed.
- **Alias cases:** at least 40 of the 200 are typed as an alias, such as "arhar dal", "bhindi", "lauki", "aval" or a Devanagari spelling.
- **Look-alikes that must not merge:** toor dal and toor dal whole; atta and maida; poha and murmura; full-cream and toned milk; fresh and dried coriander.

## C. Automated tests (in the repository)

- **`catalog/normalize.test.ts`:** golden normalization cases (scripts, plurals, descriptors kept), including the alias examples in the brief, labelled illustrative.
- **`catalog/match.test.ts`:**
  - an exact alias gives the item;
  - a collision gives one question;
  - a near match gives a suggestion and is never linked;
  - a barcode gives a product, with its label nutrition staying on the product.
- **`catalog/import.test.ts`:** fixture source records with a dry-run diff, then idempotent apply, rights gate refusal and rollback by batch.
- **DB tests** (`scripts/test-catalog-rls.mjs`):
  - a member reads approved rows only;
  - no session can write;
  - the non-food trigger;
  - the default-link uniqueness;
  - the `research_only` link refusal.
- **Golden evaluation** (`npm run eval`): HomeTalk "add arhar dal" on a household that tracks "Toor dal" adds to *that* item; a HomeSend receipt line "Tata Sampann Toor Dal 1kg" suggests the household's Toor dal and stays household-private.
- **Browser** at 360 px and desktop: Add an item shows the household's own items first, then catalog items with the illustration and the household's language label. A name is never truncated. An item page shows nutrition with its basis and source, and "approximate" where it applies.

## D. Performance

- Catalog search p95 at most 500 ms, measured against the live project with the pilot data loaded (target from `TECH-STACK-AND-NFR.md`).
- The sheet's debounce means one query per pause, not one per keystroke.

## E. Rights and attribution

- The licensing matrix is signed off by the owner before Stage 3 (see `DATA_SOURCE_LICENSE_AND_QUALITY_AUDIT.md`).
- Every Open Food Facts product shown carries its credit. A product picture carries CC BY-SA attribution.
- IFID aliases carry their ODC-By attribution on the catalog's credits page.
