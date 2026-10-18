# HomeBrain 4.0 phases 0 and 1: hearing it right, doing what was asked; the Voice page reworked

**Date:** 2026-10-18 · **PR:** #240 · **Stories:** 14-024, 14-025 · **Spec:** `design/HOMEBRAIN-4.0-DEEP-HOUSEHOLD-INTELLIGENCE.md`

## Why

The owner's two Gemini Live conversations went wrong:
- **"Okay, so. Okay, who are the family members in this household?"** was answered "I couldn't find the list".
- **"I am planning a movie night on Friday this week"** got "That needs your OK on the screen, please type it".

The owner then said: "it should just understand user intent and do what is asked during conversation, no separate okay required". A third ask came mid-way: "review this page [Settings → Voice] and correct/improve it… browser is not the voice right now, gemini is".

## What was done

### Hearing it right (14-024)
- **Cleaning the sentence.** `conversation/normalise.ts` cleans each utterance before anything reads it. It removes spoken lead-ins, wrappers, a repeated word and polite tails, and reads "I am planning X" as "plan X".
- **Where it runs.** Both `converse` (every channel) and the HomeTalk turn use it. The stored member message keeps the person's own words.
- **The roster rule** now also accepts "…in this household", "who all live in this house", "list all the family members" and "name everyone in the family".
- **People answer people questions.** "Members", "everyone" and the like put people in focus, and people and pets facts can now answer a question about them.

### Doing what was asked (14-025)
- **Three tiers.** `conversation/consent.ts` decides, for an adult's own request in the conversation:
  - **act:** done at once. Covers the list, reminders, preferences, plans, meals, being away oneself, school ticks, repairs, what is at home and one's own health notes.
  - **confirm:** asked once in the conversation. Covers guests, someone else's day or duty, a name resolved at medium confidence, and booking a health appointment.
  - **step_up:** paying and ordering, unchanged.
- **Who it applies to.** Children, helpers and agents still follow autonomy. `decideAutonomy`'s floor (payment, access, delete) still holds.
- **Reading a plan.** `readPlan` keeps the day out of the event's name and takes the time of day from the name ("movie night" means evening). Guests are read as guests, and a gathering ("dinner party") stays an event rather than becoming a meal.
- **Undo.** "Undo" takes back the last thing HomeTalk did in this conversation in the last 30 minutes. `undoExecuted` reuses the correction path, which now also cancels an event and removes a meal. Undoable replies end with "Say **undo** to take it back."
- **Gemini in the app** gets a new `in_app` policy for plans, what is at home, and who does what. Alexa keeps `app_only`, and paying and ordering are never done by voice. Gemini's instructions and the `ask_household` tool now pass requests through.
- **The switch.** Settings → AI Assistant gains "Ask before acting on what I say" (an Admin's choice, off by default). It is a `policies` row (`ai_autonomy`, `conversation/consent-repository.ts`), so no migration was needed.
- **Words.** The footer, the intro line and three help paragraphs are updated in 8 languages. CLAUDE.md is updated too.
- **Golden cases.** HT-14, HT-23 and HT-24 now expect execution, because the owner's rule changed; each description says so. New cases: HT-100, HT-101, HT-103, HT-105, HT-106, HT-107 and HT-110.

### The Voice page
- **"Right now" says what really speaks:**
  - Gemini Live in a conversation, when it is chosen and runs;
  - a Google voice only where a key exists;
  - otherwise the phone's own voice.

  It no longer shows "WaveNet … Browser".
- **A new "Using voice" card** covers starting and stopping, asking for things, "undo" and floating, with a link to Alexa (Settings → Voice assistants).
- **Live conversation comes first** on the page.
- **Clearer wording.** "Reading typed replies aloud" replaces "No speech service configured".
- **Google-only controls** are hidden when no Google voice is in use. They are still posted, so saving never resets them.
- All of it is in 8 languages.

## As built, differently from the spec
- No new `do_household_change` Gemini tool: `ask_household` already reaches the engine, so its description and Gemini's instructions changed instead.
- No Undo chip yet. Typed or spoken "undo" works.
- `decideAutonomy` is unchanged. The person-request logic lives in `consent.ts`'s `decideForRequest`, built on it.

## Verified
- **Checks:** typecheck, lint, core unit tests, help tests 68/68, help links, `npm run eval` (all gates; 127/127 golden), build, bundle check.
- **Browser, live project, a fresh QA household:**
  - Gemini's exact roster sentence was answered with the member list.
  - "Okay I am planning a movie night on Friday this week" became an event on Fri 23 Oct, 6–11 pm, with "Say undo to take it back".
  - "Undo" set the event to cancelled (checked in SQL).
  - Turning the switch on held across a reload, and the next plan was asked first.
  - The Voice page and AI Assistant page were checked at 360px and 1280px, with no horizontal scroll.

## Open
- 14-026 (look deeper) is next, then 14-027 (one pass).
- An Undo chip for typed replies.
- A record_absence for a child one guards still asks once: the proposal step does not know guardianship.

## QA cleanup

Recorded after the merge. The #238 and #239 cleanup is in `docs/progress/2026-10-18-homebrain-4-design.md`.
