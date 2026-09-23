# Share the load: workload optimization (story 03-008)

## What was done

WonderHome now notices when one person carries far more of the household
than another, and offers a fair swap that the household has already half
made.

- **`packages/core/src/household/workload.ts`** (pure):
  - `timesPerWeek`, `memberLoads`: a member's load is every outcome they
    own, counted by how often it comes round (daily 7, weekly 1, fortnightly
    0.5, monthly about 0.25). An outcome whose rhythm was never set counts as
    weekly, and the load records that it was assumed (rule 9: a number is
    arithmetic someone can explain).
  - `findImbalances`: only a gap worth a word is named. The heaviest person
    must carry at least twice the lightest in their group, and 5 or more
    times a week more. Small differences are how households are.
  - `suggestRebalance` offers up to three swaps, and each swap:
    - makes the outcome's named backup its owner, and the owner its backup;
    - stays within adults or within helpers, and never involves a child;
    - must narrow the gap, never flip it.

    Nobody is handed something they were never part of. When nobody backs
    anything up, the imbalance is named and no swap is invented.
  - `formatPerWeek` says a load the way a person would.
- **`packages/core/src/household/workload-repository.ts`**:
  - `acceptRebalance` applies a swap through the same validated, audited
    `saveResponsibility` as any responsibility change. It is idempotent: a
    swap already in place changes nothing. A suggestion the household has
    moved on from is refused with a 409 rather than applied to what is
    there now.
  - `householdWorkload` reads loads, imbalances and suggestions for the API.
- **Responsibilities** (All tab): "Share the load" appears only when there
  is something to share. Each suggestion names the outcome, who could take
  it, and the arithmetic, with a one-tap Swap for Admins. An imbalance with
  no swap available is named, with the way forward: give some of the
  outcomes a backup.
- **API:** `GET /api/v1/households/{householdId}/workload` (any member) and
  `POST /api/v1/households/{householdId}/workload/rebalance` (Admin). The
  OpenAPI document is updated.

## Why

The story is "optimize household schedules and workload". In a household
the real lever is who owns which outcome. Optimizing that has to respect
the module's rules: outcomes, not chores; nobody gets new work they were
never part of; nothing changes without an Admin; and every transition is
idempotent and testable.

## Verified

- **Unit tests:** 2575 passing, 10 of them new.
  - `household/workload.test.ts` (6): rhythm counting and the assumed flag,
    wording, silence about small differences, the best narrowing swap,
    never a child and never a helper taking a family outcome, and no swap
    invented without a backup.
  - `household/workload-repository.test.ts` (4): the swap keeps everything
    else, is idempotent, refuses a moved-on suggestion, and returns not
    found for an outcome that isn't the household's.
- **Gates:** typecheck, lint and the boundary lint are clean. No migration
  was needed: this story is logic over existing tables.
- **Browser, on the real project, at 360px and 1280px, with no horizontal
  overflow:**
  - The QA household had one adult carrying about 14 times a week (two
    daily outcomes and a monthly one) and another carrying 1. It was offered
    exactly one swap: the backup taking the school run, leaving about 7 and
    8.
  - One tap applied it, leaving one `responsibility.updated` audit row, and
    the section went quiet once the split was balanced.
  - The API gave the same loads and suggestion, and accepting the swap
    again returned `changed: false`.

## Open

- **No time-of-day scheduling.** Windows are not considered: whether the
  person taking a daily outcome is actually free at its time is not yet an
  input. A future pass can weigh `member_availability` once outcomes carry
  their operating windows consistently.

## Test data cleanup

Recorded after the merge, below. This covers both this story and 07-008,
which used the same QA account.
