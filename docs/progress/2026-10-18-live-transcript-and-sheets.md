# Gemini Live writes what was said; sheets open calmly with the keyboard (04-023, 25-016)

**Date:** 2026-10-18 · **PR:** #234

## The chat line in Gemini Live (04-023)

**The report.** Gemini heard the owner clearly and answered well, but the chat wrote different, misspelt words.

**Why.** The chat line came from the Live API's `inputTranscription`. That is a light transcriber running beside the conversation model, and it guesses the language without help. The model's own understanding is never exposed as text.
- Google documents transcription hints (`languageCodes`, `customVocabulary`), but only for its separate `gemini-3.5-transcribe-live` model.
- Adding those hints to WonderHome's locked conversational session could stop the session from starting, and that could not be tested here.

**What changed.**
- The page keeps each turn's microphone audio: at most the last minute, and the same audio the session already sends.
- Once the person's line is shown, `POST /api/v1/households/{id}/voice/gemini/transcribe` writes it down word for word with a full Gemini model (`voicelink/live-transcribe.ts`). It is told the member's listening language and the household's names.
- The chat line, and the floating window's line, are replaced with the result.
- **Gate:** the same as the session (flag, plan, Google key, data-use agreement), plus its own rate limit, `voice.transcribe`.
- **Nothing is stored.** On any failure, Gemini's own line stays.
- What HomeTalk does is unchanged: tool calls carry their own words.

## Sheets and the keyboard (25-016)

**The report.** A sheet and the keyboard opened together and flickered while they settled, and the keyboard could hide the field to fill in.

**What changed in `ui/sheet.tsx`** (every sheet gets this):
- On a touch screen, the sheet focuses itself when it opens, so the keyboard waits for a tap.
- On Android Chrome, `interactiveWidget: "resizes-content"` in the root layout lifts the sheet natively.
- On iOS, the keyboard's height is measured once per frame, with the CSS transition removed.
- The tapped field is scrolled into view once the keyboard has settled.
- Add an item's search still takes focus at once on a desktop.

## Verified

- **Gates.** Typecheck, lint, security (12/12) and boundaries pass, and so do the voicelink and component tests (157).
- **Unit tests** for the WAV header, the vocabulary, the instruction and the cleaning.
- **The route** refuses with 403 without Gemini voice, 400 for a bad body, and 401 when signed out.
- **Chromium emulating a phone:** no field is focused when a sheet opens, and a field below the fold scrolls into view on tap.
- **Desktop:** the search is focused at once.

## Still open

A real phone is needed for two checks: a Gemini Live conversation (the transcribe call needs a household's Google key, which a session does not use for testing), and a real on-screen keyboard.

## QA cleanup

Checked on 2026-10-18 after the later merges (through #237): no `wonderhome-qa-verify.internal` account remains on the live project and no QA household this work created is left; the count was taken with `select … from auth.users where email like '%wonderhome-qa-verify.internal'`. Two older QA households from 2026-10-17 (`QA Welcome Home` b942c154…, `QA Hours Home` 7ab6da76…) could not be proven to be this work's and were left in place.
