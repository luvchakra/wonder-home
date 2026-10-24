# HomeSend: the day and time a flyer names are always found

Date: 2026-10-25 · PR #330

## Why

The owner sent a health camp flyer whose caption said "Sunday, 25th Oct'26, 7:30 AM – 1:30 PM". After switching the review to Event, the date and time fields were empty.

There were three causes:

1. The flyer was first read as a grocery, and a grocery reading never kept date words: both the prompt and `sanitizeIntakeExtraction` nulled `dateText`. Moving the item to an event at review left nothing to set the day from.
2. The date only appeared in the reading's notes. Nothing looked there when the model wrote no `dateText`.
3. `dayFromDateText` did not read the short year in "25th Oct'26". It also missed "25-Oct-2026", "Oct. 25th '26" and similar forms.

## What changed

- **More date forms are read** (`EXPLICIT_DATE`, `explicitDate`): "25th Oct'26", "25 Oct ’26", "25-Oct-2026", "25-Oct-26", "25 Oct, 2026", "Oct. 25th, 2026" and "October 25 '26". "Oct 25-26" is still a range of days, never read as the year 2026.
- **`findDatePhrase`** (in `ai/classify-intake.ts`) finds the words that name a day inside free text such as a title, notes or a summary.
  - It takes a written-out or numeric date with the weekday just before it, plus the time given on the same line.
  - Failing that, it takes a said day ("this Saturday", "tomorrow") with its time.
  - It returns a phrase for the existing rules to decide on, never a day of its own.
- **Fresh readings:**
  - `groundIntakeDate` uses that phrase for a dated kind when the model wrote no date words.
  - `sanitizeIntakeExtraction` now keeps `dateText` whatever the kind.
  - The prompt asks for the day and time wherever they appear (poster, caption, forward, the sender's note), whatever the kind.
- **Stored readings:**
  - `HomeSendExtraction` keeps `dateText`.
  - **`homesend/when.ts` `recoverWhen`** fills `dueDate`, `dueTime` and `endTime` from the item's own words on the household's clock, relative to when it was sent. Ingest applies it, and `/home-send` applies it to waiting items. A flyer already waiting therefore opens with its day and time once it is moved to Event.
  - It never overrides a day already set, and it decides nothing when the weekday and the date disagree.
- **Evaluation:**
  - Golden case HS-23 is the owner's flyer exactly as the model read it (a grocery, with the date only in the notes). It expects an event on 2026-10-25, 07:30–13:30.
  - `homesend/when.test.ts` adds 34 cases: every date form, times on the same line, prices and quantities that are not times, a weekday that disagrees with the date, and text with no day at all.

## Verified

- `tsc` passes for core and web, and ESLint passes on the changed files.
- Vitest passes for `ai/`, `homesend/`, `whatsapp/`, `evaluation/` and `conversation/`: 1435 tests.
- `npm run eval` passes 166/166, with 0 unsafe actions.
- `check:bundle` and `lint:secrets` pass.

## Open

- An item already waiting has its day and time recovered but not its place. The Where field reads from the new `location`, which older readings lack.

## Cleanup

No test data was created.
