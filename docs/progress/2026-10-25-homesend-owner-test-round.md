# HomeSend: the owner's test round, and what it fixed (2026-10-25)

The owner ran the HomeSend test list on the live app and reported five
results. The live data (`home_send_items`, `homesend_changes`,
`responsibilities`) was read for each before anything changed.

## What was wrong, and what changed

- **Typed into HomeTalk, a statement was read as a move.** "Asmi's karate
  grading is on Sunday 1 November at 9.30 am" got "What should move, and to
  when?". HomeTalk had no action for being told about a new dated thing, so
  the model chose `adjust_schedule`. New action `file_with_homesend`
  (`conversation/intent.ts`): the executor hands the person's own words to
  HomeSend's `ingestText`, the same path as the paperclip, and replies with
  what it read and a link to HomeSend. It needs no target or grounding
  (HomeSend resolves names and dates), is a "draft" in autonomy terms
  (nothing reaches a domain table until a person confirms in HomeSend), and
  sits with school and calendar changes in the voice matrix. A rule
  (`conversation/rules.ts`) reads the common shapes without a model; the
  model prompt describes the action and says a sentence with no move word is
  never `adjust_schedule`. Golden case HT-142; rules tests for what it must
  and must not catch.
- **The class on an activity was free text.** The review now offers the
  chosen child's own classes (`ActivityClassField` in `home-send-intake.tsx`,
  rule 20), with "Add new…" for one not listed. The class the content named is
  pre-picked when the child has it. Classes are loaded in the same wave as
  members on `/home-send` and `/ai` (`school/activities.ts`
  `childrenWithClasses`).
- **A photo's reason read badly.** It now says "This was read from a photo or
  a file, which can't be checked word by word, so a person looks first."
- **A WhatsApp voice note failed with no reason anywhere.** The transcription
  catch blocks now log the service, the audio type and size, and the error
  (keys redacted; never the audio or its words), so the next failure is
  diagnosable from the production logs.

## What was not a defect

- **Test 9 (groceries on Execute).** "We need paneer", "maggi" and "avocado"
  were read at 97% and verified, but sent at 19:07–19:11; "Grocery shopping"
  (`groceries.stocked`, the outcome HomeSend follows) was set to Execute at
  19:20. Sent again now, a new item should add on its own.
- **Test 14 (moved date offered as new).** The moved message was sent at
  19:31, before test 2's Maths test was confirmed (19:35:01), so nothing was on
  record to update. Once it was, the same item applied as an update
  (19:35:46), and the cancel worked on it (19:36:41).
- **Test 16 (undo).** Undo archives the record (rule 12); Health keeps
  archived records under Recent with "bring back". Whether an undone HomeSend
  item should disappear instead is the owner's call.

## Verified

- `npm run eval`: 172/172, every blocking gate passes (voice: 31/31 actions
  placed).
- Live Anthropic: HT-142 3/3; the model files "There's a piano recital for
  Asmi this Saturday at 5 pm", "Asmi got invited to Meera's sleepover next
  Friday", "Manan's school annual day falls on 14 November" and "Karate
  grading for Asmi, Sunday 1 Nov, 9.30am" with HomeSend, and still reads
  "Move Asmi's karate grading to Saturday" as a move and "What's on this
  Sunday?" as a question.
- Unit tests for conversation, voicelink, ai, evaluation, homesend and
  homebrain; `packages/core` and `apps/web` typecheck; ESLint on the changed
  web files; `lint:help-links`; the web build.

## Open

- The voice-note cause is still unknown; the next failure will log it.
- A HomeTalk statement waits in HomeSend; it is not auto-applied from
  HomeTalk even on Execute (the review step decides that on `/home-send`).
