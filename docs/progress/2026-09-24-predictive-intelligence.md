# Looking ahead: predictive intelligence (story 14-008)

## What was done

WonderHome now reads the next two weeks for the household. It names a few
risks and opportunities early enough to act on, from rows the household
already has.

- **`packages/core/src/ai/predictions.ts`** is pure, deterministic and
  read-only. It predicts three shapes over a 14-day horizon:
  - **One shop covers several things** (an opportunity): three or more
    consumables whose `expectedDepletion` falls within a week of each other.
    It rests on the buying pattern, or on what the household stated when any
    of the rates came from it.
  - **Bills bunching** (a risk): two or more unpaid bills due within 5 days.
    The amount is added only for bills that have one, and only in a single
    currency. Anything else is said in words ("plus 1 whose amount isn't in
    yet").
  - **A full school week** (a risk): a child's exam in a week that already
    holds three or more other things due.

  Each prediction names its basis (buying pattern, stated, or dates already
  set) and the one place to act. The thresholds are deliberately high, so an
  ordinary week says nothing. No model is called, nothing is written, and a
  prediction never becomes a fact. Confirmed facts are untouched by
  construction.
- **`packages/core/src/ai/predictions-repository.ts`** reads through the
  member's own session. A domain the member cannot read is not predicted
  from, and one that fails to load is left out rather than guessed at.
- **Today, Household view:** "Looking ahead", soonest first, sits after
  "Needs a person" (rule 17: what needs you now, then what is coming). It
  uses exactly the data the view already loads under the viewer's
  permissions: bills only with finance access, school only with school
  access, and never on a child's view.
- **API:** `GET /api/v1/households/{householdId}/predictions`. The OpenAPI
  document is updated.
- **Money format fix** in `finance/payments.ts`'s `format`: an amount with
  paise now always shows two decimals ("₹3,449.50", not "₹3,449.5"). Whole
  amounts stay whole. This affects every place that formats money, which is
  the point of rule 22.

## Why

The story asks WonderHome to predict household risks and opportunities.
The module's standing rules shape how: the household is told only when
something needs a person, learned patterns stay distinguishable from facts,
and numbers are arithmetic someone can explain. Hence three narrow,
checkable predictions rather than a model's guess.

## Verified

- **Unit tests:** 2582 passing.
  - 7 new in `ai/predictions.test.ts`:
    - a stock-out cluster, and silence for one or two items;
    - a stated basis is reported as stated;
    - bill bunching with a partial total, excluding paid bills;
    - silence for bills a week apart;
    - a heavy school week, and silence for a light one;
    - ordering and the 14-day horizon.
  - 1 in `finance/payments.test.ts` for the two-decimal format.
- **Gates:** `npm run eval` passes 47/47, with an Unsafe Action Rate of
  0/14. Typecheck and lint are clean.
- **Browser, on the real project, at 360px and 1280px, with no horizontal
  overflow:** seeded rows produced exactly three predictions, soonest first:
  - Electricity and Internet due between 26 and 28 Sept, ₹3,449.50;
  - one shop for Milk, Rice and Soap from the buying pattern;
  - the Maths exam and 3 other things in the week of 28 Sept.

  The personal view showed none, and the API returned the same three.

## Open

- **Deliberately few shapes.** Weather-driven laundry and outdoor plans
  already have their own signal (17-007).
- **Not pushed.** Predictions are not sent as notifications. The product
  rule is that the household is told only when intervention is needed, and a
  two-week look-ahead is information until then.

## Test data cleanup

Recorded after the merge, below. This covers stories 07-008, 03-008 and this
one, which shared one QA account.
