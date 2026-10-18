# HomeBrain 3.0 phase A: the Household Context Store (14-020), wait to speak until HomeTalk can hear (04-021), and pieces to grams live (25-013)

**Date:** 2026-10-18 · **Stories:** 14-020 (Done, live), 04-021 (Done), 25-013 (Done) · **Design:** `design/HOMEBRAIN-3.0-HOUSEHOLD-CONTEXT.md`

## Why

The owner's reports on 2026-10-18 were one design limit:

- Asmi's birthday party had guests on it, and HomeTalk said it knew nothing about them.
- "Upasana likes Italian food" was remembered, then forgotten minutes later.
- Replies took 4–16 s.

Each turn rebuilt the household's context from about twenty reads, only seven days ahead and twelve records to a list. Event guests were never read at all. The owner approved the design ("implement the design") and this is its first phase.

## What was built

### The store

- **`household_context`** (migration `20261018250000`): one row per household holding its whole context as the canonical items the context engine already builds. Service role only: the repo's server-only shape, the usual grants and a deny-all policy, so a session sees no rows rather than a permission error. It goes with its household. (A bare revoke failed the tenant-isolation suite on its first CI run, as it once did for the reconciliation tables.)
- **`homebrain/context-store.ts`** builds it with every record spelled out (`limitLists: false`): no seven-day horizon, no twelve-to-a-list cap, the calendar, meals and absences from a month back to 400 days ahead, every memory and belief, event guests and their replies, the Meals screen's food preferences, the place book and the home address.
- **Staying right.** A domain write (`invalidateHouseholdContext`, which every repository write already calls) sets `stale_since` and rebuilds the row after that response through Next's `after()`. The row counts as current only while no write is later than when its build began reading, so a write during a rebuild still leaves it behind. A turn that finds it behind, more than an hour old or from yesterday rebuilds it once, one rebuild per household at a time.
- **The turn's read.** `loadHouseholdContext` asks the store first: one row for the household's records, plus the viewer's own records read live (people, their notifications, their proposals, health, the agenda). Stored items are held to the same lines a live read draws: each domain's `permitted` gate, a child's own school items only and no school notes, then `filterForViewer` in memory before anything leaves the server.
- **Fallback.** Without a service-role key or the table, it answers null and the live path runs exactly as before. `WONDERHOME_CONTEXT_STORE=off` turns it off.
- **Where it lives, and why there.** The context engine's own guard test says no file under `context/` ever holds a service-role client. The store is a server-only layer above the engine, so it is in `homebrain/`, and that guard stands unchanged.

### Fixes the golden cases found

- **"Who is coming" is not "coming up".** `calendar/answer.ts`'s look-ahead read "a few people are coming" as "coming up" and answered with the family's dates of birth. That is exactly what the owner saw. A question about who is coming, guests or invites now goes to the event itself.
- **Live reads carry the new records too.** The live calendar read includes guests, the preferences read includes food preferences, and a new `places` domain reads the place book and home.
- **Narrow place words.** The place domain's words are only words that name a place. "Go" had pulled "when do the children go to bed?" away from the bedtime belief.

### 04-021: wait to speak until HomeTalk can hear

The owner reported that Gemini Live takes a few seconds to start listening, but HomeTalk looked ready the moment it was tapped, so people spoke into nothing.

- **Its own state.** A live session now has a `connecting` state, kept apart from thinking and listening. Before, Gemini's "connecting" was shown as "thinking".
- **The composer.** While connecting it shows "Getting ready… don't speak yet" in amber, with a turning ring and no moving bars, and "{who} is connecting. Start speaking when it says it's listening." in an assertive live region. Once the session can hear, it shows "Ready — speak now" in green for three seconds, then the usual "… is listening".
- **Elsewhere.** The live bar on other screens shows a turning ring instead of the microphone, and the floating window says the same words.
- **WonderHome's own voice** does the same on a session's first listen. It waits until the recogniser says it has started (`onstart`), or until the microphone is recording (`captureUtterance`'s new `onReady`). After 2.5 s it is taken as ready, so it never sticks.
- **Words and help.** The labels are in eight languages, and help Voice paragraph 2 says to wait for "Ready — speak now".

### 25-013, live

The owner ran `20261018240000` in the SQL editor. The service-role key cannot run DDL: the Management API answered 401 and there is no SQL RPC. `npm run verify:live` passed 278/278.

## Verified

- **Unit tests.**
  - `homebrain/context-store.test.ts`, 14: guests in an event's summary with a count, whole lists, food preferences, places, an allergy kept as health, the stale rule, the size cap letting history go first, each viewer's gates, the store-or-live switch.
  - All unit tests pass (3,397), and the scripts' suite (64).
- **DB.** `scripts/test-household-context-rls.mjs`, 4/4: not even the household's own Admin reads it, no session writes it or marks it stale, the deny-all policy is in place, and the row goes with its household. The whole DB suite passes (636).
- **Evaluation.** `npm run eval` passes 120/120 with unsafe actions 0/17. New golden cases HT-89 ("Check Asmi's birthday event, a few people are coming") and HT-90 ("Who is coming to Asmi's birthday party?") name Riya Shah and Dev Kapoor and say 5 are coming. The golden households now run whole lists, as the store keeps them.
- **Gates.** Typecheck, lint, import boundaries, migration, secret and embed lints, help links and a production build all pass.
- **Browser, 25-013**, at 360px and 1280px against the live project. An item in pieces, with 3 at home and 2 on the list, was switched with "Counted in" → grams (g):
  - the hint said what would happen;
  - the item is now counted in grams;
  - stock went back to not counted, with the 3 pieces kept on the change's record;
  - the list reopened at 50 g;
  - no errors and no horizontal scroll.
- **Browser, 04-021**, at 360px and 1280px, with a scripted recogniser that takes 2 s to start hearing: at 0.5 s "Getting ready… don't speak yet", at 2.5 s "Ready — speak now", at 6 s "HomeTalk is listening…". No errors and no horizontal scroll. The Gemini Live path uses the same state. It was not run here, because the QA household has no Google key and none was added.
- **HomeTalk with the store, on the live project**, after the owner ran `20261018250000`:
  - `verify:live` passed 280/280.
  - "Who is coming to the QA birthday party?" and "Check the QA birthday party, a few people are coming. Do you know?" both answered "QA birthday party (birthday) is on Wed 9 Dec at 5:00pm. Guests: Riya Shah (3 people) said yes; Dev Kapoor said maybe — 3 coming so far."
  - The first turn built the row (10.8 KB, 11 s); the next took 5.5 s, which is now the model calls (phase B's work).
  - "Add bananas to the grocery list" marked the row behind, and it was rebuilt after that response: version 1 → 3, built after the write, 11.7 KB.
- **Two fixes the live check found.**
  - The first live run still said "nothing on the calendar", and the row stayed empty. Next bundles `instrumentation.ts` apart from the route handlers, so the store's reader, set in a module variable at startup, was never seen by a turn. The reader and the write listener now live on `globalThis`, which every bundle shares.
  - A guest's reply through an invite link is written without a member's session, so it was not one of the wrapped writes. It now marks its household changed (`replyThroughLink`), and HomeTalk hears new replies.
- **HomeTalk on the live fallback path, before the table existed.** For a party seeded on 9 December with two guests, both questions came back "Nothing is on the family calendar for the next 7 days" in 5–7 s. That is the report reproduced live. The check with the store follows the SQL run.

## Needs a person

- Nothing for phase A. Phase B (one model call over question-sized facts, streamed) is the speed; its own story is 14-021.

## Where the code lives

- `supabase/migrations/20261018250000_household_context_store.sql`
- `packages/core/src/homebrain/context-store.ts`, `context-store.test.ts`
- `packages/core/src/context/{builders,repository,invalidation,retrieval,types}.ts`
- `packages/core/src/calendar/answer.ts`
- `apps/web/instrumentation.ts`
- 04-021: `packages/core/src/components/ui/{talk-composer,live-talk,live-float,use-live-voice}.tsx`, `packages/core/src/voice/{recognition,capture}.ts`, `hometalk.composer.getReady`/`getReadyHint`/`speakNow` in eight catalogs
- Golden cases: `packages/core/src/evaluation/{cases,households}.ts`
- DB test: `scripts/test-household-context-rls.mjs`; probes: `scripts/verify-live-project.mjs`
- Help: HomeTalk paragraph 13 and Voice paragraph 2, in eight languages.

## QA cleanup

Recorded after the merge.
