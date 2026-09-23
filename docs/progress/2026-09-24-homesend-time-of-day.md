# HomeSend reads the time of day (story 14-014)

**Story:** 14-014 is Done.

**The gap it closes:** the test spec's live run (23 Sep 2026) sent "Saturday 26 September at 9:00 am". HomeSend kept the day and dropped the time.

## What was built

- **The time is read deterministically from the notice's own date words.**
  - `ai/classify-intake.ts`'s `timeFromDateText` reads a time only when it is unmistakably a clock time: "9:00 am", "9.30am", "14:30", "noon". It also reads ranges: "9–11am", "from 2 to 4 pm", "11-1pm".
  - A bare "at 9", a day of the month, a year or "27/09" decides nothing. The person fills the time in.
  - `groundIntakeDate` sets `dueTime`/`endTime` ("HH:MM", the household's clock) only for a school item whose day is known. A time on its own never invents a day. A day with no time stays all-day. Bills and health documents keep a day only.
  - `sanitizeIntakeExtraction` nulls any time a model sends. A time is the server's to decide, never the model's.
- **Found live, fixed.** Real Gemini copied only the date words into `dateText` ("this Saturday, 26 September") and dropped the time next to them.
  - The prompt now asks for the time or time range, as written, in the same field.
  - `dateText` may be up to 120 characters, so a longer phrase no longer discards the whole reading.
  - Re-run on real Gemini:

    | Notice said | Grounded to |
    |---|---|
    | "from 9:00 am to 11:30 am" | 09:00–11:30 |
    | "Friday at 4pm" | 16:00 |
    | "Thursday" | all-day |
- **Storage.** Migration `20260927090000` is applied live.
  - It adds `school_items.due_time_known` and `ends_at`.
  - Constraints: a time needs a day, and an end needs a timed start before it.
  - Existing rows not at midnight UTC were backfilled as timed. They already showed a time.
- **One core module for "when"** (`school/times.ts`):
  - `schoolWhen`: date + local time → the instant; all-day keeps the midnight-UTC convention.
  - `movedSchoolWhen`: a moved item keeps its local start and length; an all-day item stays all-day.
  - `schoolDateValue`/`localTimeValue` feed the forms.
  - `schoolDayZone`/`schoolTimeWords` feed the screens.
  - It replaces HomeSend's `movedDueAt`, which kept a made-up clock for all-day items.
- **Every path carries the time.**
  - Forms: the HomeSend review, manual add and edit forms have optional Starts/Ends fields.
  - HomeSend: confirm, auto-apply, update-an-existing-item and Undo keep the flag and the end.
  - HomeTalk: "move it to Friday" keeps what was known about the time; it used to invent 9:00 for an item with none.
  - The school connector: a portal's midnight-UTC due date is a day; any other instant is a time the portal gave.
- **Screens never show a time nobody gave.**
  - Kids & School's events list shows "9:00 AM – 11:00 AM" or "all day". It used to show "5:30 AM", which was midnight UTC seen from India.
  - An all-day item's day is read in UTC everywhere, so it no longer slips to the evening before west of UTC. This covers the school list, the child's home and Today.
  - Today places school items by the household's own local day.
- **Evaluation.**
  - A new `time` stage.
  - The deterministic runner now grounds recorded readings the way the live path does.
  - HS-04 ("Annual Day on 2 October at 10am") expects 10:00.
  - Golden sanitizer scenario CI-14014-01: a model-set time is dropped.

## Verified

- **Unit tests:** 2444/2444, including:
  - intake time: 23;
  - school times: 8;
  - HomeTalk move: timed keeps start and length, all-day stays all-day;
  - classify golden scenarios.
- **Other gates:**
  - Typecheck and lint clean.
  - Database: 446/446, including the new school time constraints.
  - `verify:live`: 155/155, now checking both new columns.
  - Eval: 45/45 with 0/13 unsafe actions, both deterministic and on the configured Google Gemini provider.
- **Browser, on the dev server against the live project, as a QA household in Asia/Kolkata:**
  - At 360px, added a timed event (9:00–11:00) and an all-day worksheet. Stored as 03:30Z/05:30Z with `due_time_known`, and 00:00Z all-day. The calendar reads "Sat 26 Sept · 9:00 AM – 11:00 AM".
  - At desktop, the edit form prefilled 09:00/11:00. Moving the event to 3 Oct kept 9:00 AM – 11:00 AM.
  - The HomeSend review at desktop and 360px prefilled the real Gemini readings. Confirming stored 09:00–11:30 and 16:00.
  - No horizontal overflow and no console errors.

## Observed, not changed

- The school assessment's `dueOn` (`school/items.ts`) is still the UTC date of `due_at`. A timed item before 05:30 local, in a zone east of UTC, would be grouped under the previous day on the Overview.
  - Fixing it needs the household timezone in `assessDeadline`'s context. That is a small follow-up, not part of this story.
- The sidebar tagline under the wordmark was clipped at desktop widths ("…FAMILY TIME!" ran under the sidebar edge). It was fixed in the same PR (#135): the sidebar lockup now wraps it to a second line (`components/shell/primary-nav.tsx`). It was measured inside the sidebar at 1024, 1280 and 1920. The other placements already fit at 360px.

## Where the code lives

- `packages/core/src/ai/classify-intake.ts` (`timeFromDateText`, `groundIntakeDate`, the prompt)
- `packages/core/src/school/times.ts`, `school/repository.ts`, `school/connector.ts`
- `packages/core/src/conversation/executor.ts` (`moveSchoolItem`), `conversation/grounding.ts`
- `apps/web/app/(auth)/home-send-actions.ts`, `(auth)/school-actions.ts`
- `apps/web/app/_components/home-send-intake.tsx`, `school-forms.tsx`, `school-item-controls.tsx`
- `apps/web/app/school/page.tsx`, `today/page.tsx`, `_screens/child-home.tsx`
- `supabase/migrations/20260927090000_school_item_times.sql`

## Test data cleanup

Ran after PR #135 merged:
- QA account `54baba4f-6ab8-47c8-b009-8f6e084be6ab`, deleted with `qa-test-user.mjs delete`.
- Household `98806a47-b044-4676-a86a-c5064b89bb77` ("Time QA Home"). With it went:
  - its seeded child member, school items and HomeSend items;
  - the subscription row set for QA;
  - its audit events;
  - this session's rate-limit rows.

SQL counts confirm none of it remains. The dev server was stopped and the scratchpad scripts and screenshots were deleted.
