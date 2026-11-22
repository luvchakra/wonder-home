# Voice: birthdays and "next month" answered from the whole calendar

**Date:** 2026-11-22 · **Story:** 26-024 (`backlogs/26-HomeEvents.md`)

## What happened
In a live voice conversation at 10:43 pm IST, the owner asked "which family member's birthday is coming up?" and then "for the next month?". Both times the answer was that there were no birthdays, though Asmi's birthday (Wed 9 Dec) and Kunal's (Fri 11 Dec) were on the calendar.

## Which engine answered
Gemini Live answered, not WonderHome's own live loop. Evidence: `hometalk_channel_events` shows a `gemini_voice` session opening at 17:13:22 UTC, followed by four tool calls. The plain replies with no emoji are Gemini's own words; HomeTalk's replies are stored with emoji. The HomeTalk turns stored in `conversation_messages` show what each tool call sent:

| Tool sentence HomeTalk heard | HomeTalk's answer |
|---|---|
| What is happening soon? | Kathak Mon 23 Nov 6 pm; then Guru Nanak's Birthday and Karate on Tue 24 Nov (correct) |
| What is happening this week? | "this week (Sun 22 Nov – Sun 22 Nov)": Vocal only |
| What is happening next month? | December, cut at 12 entries (through 7 Dec), "…and 41 more" |

Gemini then said "no birthdays" from those partial lists.

## Root causes
1. `get_upcoming_events` had no topic, so "birthday" was lost: the question reached HomeTalk as "what is happening this week?".
2. Said on a Sunday, "this week" ran from Sunday to the same Sunday: one day.
3. A month's answer listed only its first 12 entries; the birthdays on 9 and 11 Dec came after them.
4. Gemini's instructions did not forbid claiming something was absent from a cut list.

## Fix
- `voicelink/gemini-live.ts`: `get_upcoming_events` takes `about` (everything, birthdays or holidays), worded as sentences HomeTalk's rules read as calendar questions (the readiness gate checks them). New instructions:
  - never say "none" unless the tool says so;
  - "…and N more" is not the whole list;
  - a follow-up keeps the topic.
- `conversation/temporal.ts`: on a Sunday, "this week" is the week ahead.
- `calendar/answer.ts`:
  - `calendarKindIn` reads the kind a question names, in English and Hinglish (birthday, janamdin, holiday, chhutti).
  - A month or week answer filters to that kind.
  - A long month always lists its birthdays and holidays under "Also in …".
  - `isBirthday` never counts a public holiday ("Guru Nanak's Birthday") or a birthday party as someone's birthday.
  - Look-ahead also understands "aane wala" and "agle".
- The typed app, WhatsApp and voice all use the same reader (`hometalk-turn.ts`) and the eval runner (`evaluation/runners.ts`).

## Before and after (deterministic, from the stored turns and the new rules)
- "Which family member's birthday is coming up?" — before: "I don't see any family members' birthdays listed on the calendar right now." After: the tool sends "When is the next birthday?" and the reply is "The next birthday is Asmi Chakraborty's birthday, Wed 9 Dec. After that: Fri 11 Dec — Kunal Chakraborty's birthday …".
- "For the next month?" — before: "There are no birthdays listed for next month." After: "Are there any birthdays next month?" gets "Birthdays on the calendar for December 2026: Wed 9 Dec — Asmi Chakraborty's birthday; Fri 11 Dec — Kunal Chakraborty's birthday". Even the unfiltered December list now ends with "Also in December 2026" naming both birthdays.
- "What is happening this week?" said on a Sunday now covers Sun 22 – Sun 29 Nov.

## Verified
- Unit tests: `calendar`, `voicelink`, `conversation`: 1080 passed.
- Deterministic eval: 515/515 cases, every gate passes (voice gate: 28 tool sentences).
- New cases HT-197 to HT-202: birthday coming up, a follow-up into November, what's next, Tuesday, Asmi's exam, Hinglish.
- Typecheck and lint pass.
- Owner's data: read-only REST queries with the E2E service role, nothing changed.

## Open
- No provider key in this container, so there was no live model run (`--provider configured`) and no live Gemini Live run. It needs a person's account.
- "When is Asmi's exam?" by voice goes to `get_school_items`, which HomeBrain answers with the model. The deterministic fallback for exam questions is weak (it lists the child's school record).
- No test data was created, so nothing needed cleaning up.
