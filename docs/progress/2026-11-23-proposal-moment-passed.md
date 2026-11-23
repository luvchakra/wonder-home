# A proposal whose moment has passed closes as not done (2026-11-23)

## Why
Owner, 23 Nov 06:52 IST: "this time has passed already, so user can't possibly take any action. apply intelligence to remove the entries". Needs you still showed "HomeTalk is waiting for a yes: Move morning walk to 5:20 am". It was asked at 23:29 on 22 Nov, so the walk it meant was the next morning's. It would have stayed until the 48-hour expiry.

## What changed
- **HomeBrain reads the moment** (`packages/core/src/homebrain/proposal-moment.ts`). This applies to a proposal about one moment (`adjust_schedule`, `plan_event`, `plan_meal`). Its moment is the occurrence's start, or the new time if that is earlier, on the household's clock. Rules come first, in this order:
  1. the day the words name ("tomorrow's walk");
  2. the calendar's next occurrence (`proposal-moment-repository.ts` `targetOccurrences`, family events with their repeats expanded);
  3. the next time the new clock time comes.
- **What has no moment:**
  - A recurring change ("every day", "from now on") has no moment.
  - Payments, orders, other actions and a child's request waiting on a grown-up never get one.
- **Written at proposal time:** `recordProposal` writes `payload.effective_until` when it is given the household's timezone. Both HomeTalk call sites now pass it.
- **The model only names a day.** Where the rules can't tell (a one-off with no readable day or time), `payload.moment.unclear` is set. On the delivery clock, a model (`proposal-moment-model.ts`, the household's key and data-use route, at most 10 a tick) is asked for the day only. `checkModelDay` accepts the answer only if:
  - it is a real date;
  - it is not before the ask and is within 14 days of it;
  - it is a day the calendar has an occurrence on, when the calendar has any.

  The time is always worked out by the rules.
- **The sweep** (`notifications/stale.ts` `sweepMomentPassedProposals`, on `/api/v1/notifications/dispatch` after `sweepStaleProposals`) handles each passed moment like this:
  1. The proposal is expired with `result.reason = 'moment_passed'`. This is a compare-and-swap, so an answer given at the same moment wins.
  2. Its approval row is expired.
  3. Its notifications are resolved as `past`; `planStale` also maps `moment_passed` → `past`.
  4. One plain line is added to that conversation ("Didn't move the morning walk: 5:20 am has passed."). There is no push.
- **At read time** (`hometalk/needs-you-repository.ts`), `loadNeedsYou` and `countNeedsYou` leave out a proposal whose moment has passed. The count now reads at most 10 proposal rows instead of a head count.
- **Legacy rows** (written without `effective_until`) are read again from their words and the calendar. With no day named, the moment is the named time on the day after the proposal was made. The owner's row becomes moot at 05:20 IST on 23 Nov.
- **Evaluation:** `Expectation.effectiveUntil`, compared in the grounding stage. New cases:
  - HT-203: "move tomorrow's walk to 5:20 am" → 2026-09-24 05:20;
  - HT-204: "every day" → none.
- **Docs and help:**
  - `docs/notifications.md`, `docs/agent-platform.md` and `CLAUDE.md` have one line each.
  - Help "Talk to WonderHome" body 2 is updated in all eight languages, with `updated` set to 2026-11-23.

## Verified
- `homebrain/proposal-moment.test.ts`: 12 tests.
  - The owner's exact row: moot after 23:50Z on 22 Nov, the line wording.
  - A one-time move that has passed: expired, and Needs you and the bell drop it.
  - A recurring change stays. A future occurrence stays.
  - Payments, orders and a referral never expire this way.
  - The model's day is checked. The reminder clears as `past`.
- Neighbouring tests pass: stale, hometalk, proposal expiry and supersede, conversation, evaluation, reply style, engine, help and i18n.
- Typecheck, ESLint on changed files, and the embeds, import-boundary, service-role, input-boundary and help-links lints all pass.
- `npm run eval -- --cases HT-203,HT-204`: 2/2.

## Live (read-only, 2026-11-23 ~07:05 IST)
- Row `6ce22ef7…` is still `proposed`. The SQL given to the owner had not run. It clears on the first delivery-clock tick after deploy, because it is inside the sweep's 48-hour read window.
- Proposals waiting across all households: 1 (`adjust_schedule`). Moot under the new rules: 1 (the owner's).

## Open
- `targetOccurrences` doesn't read single-occurrence exceptions (`event_exceptions`). A moved occurrence is judged at its rule time.
- No migration: `effective_until` lives in the jsonb payload.
- Cleanup: no QA data was created. The read-only count ran from a scratch test file, which was deleted.
