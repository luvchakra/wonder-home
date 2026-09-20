# One composer, four states (story 04-010)

## What was done

The Talk composer was rebuilt to an approved design sheet. The substance
of the change is not the rounded corners — it is that **speaking and
conversing are two different intentions and now have two different
buttons.**

Before, one microphone did speak-to-text, and a live conversation was a
toggle bolted underneath the Send button. Nothing about a tap told you
which you were about to get. Now:

- **The microphone** transcribes into the field for review. You can edit
  what it heard, then Send. It never starts a conversation.
- **The waveform beside it** starts a real back-and-forth: WonderHome
  answers out loud and keeps listening until you pause or end it.

They sit adjacent, same size, differently coloured, because they are
siblings rather than a primary action and its variant.

**The four states, as the sheet draws them.**

| State | What you see |
|---|---|
| Default | Mark, "Ask WonderHome anything…", microphone, blue waveform |
| Typing | The same, with the waveform replaced by a blue send arrow |
| Speak-to-text | A blue pill with animated bars and "Listening…", a blue stop button, and a three-step trail: Listening → Transcribing → Ready to send |
| Live conversation | Tall animated bars, "Talking with WonderHome…", "Tap to pause", and a red cross to end |

**The state machine is explicit and tested.** `talkComposerState` is a
pure function over three inputs (the live session, the transcriber, and
whether there is text), exported and unit-tested, because the failures in
a component like this are illegal *combinations* rather than wrong
values. Two in particular cannot now be represented: a Send button while
the microphone is open, which would commit words somebody is still in the
middle of saying, and a live session left running behind a composer that
looks idle.

**Live conversation gained pause and resume.** Pausing closes the
microphone but keeps the session open, so resuming continues the same
conversation and the recap at the end still covers all of it.

**Speak-to-text now uses the household's provider too.** If Google Cloud
Speech is configured it transcribes through our own server, with the
household's language and phrase hints; otherwise the browser does it.
Same control, same three steps, either way.

## The `+` button, and why it is not there

The sheet shows a `+` attachment button in states 1 and 2. It is not
built, deliberately. WonderHome has no attachment pipeline — no storage
for conversation media, no multimodal handling in the conversation route,
and no answer yet for how an image of a child would pass the AI privacy
gate (story 15-005). Shipping the button would have been exactly the dead
control that CLAUDE.md's rule 10 and the request's own "do not mock
functionality" both forbid.

Attachments are a real feature worth doing as their own story, with the
privacy question answered first. Everything else on the sheet is built.

## What was verified

- `npm run typecheck` — clean.
- `npm run lint` — clean, no warnings.
- `npm run test` — 89 test files pass. Nine are new and cover the state
  machine exhaustively, including the precedence rules above and the fact
  that a denied or unsupported microphone falls back to composing rather
  than a stuck field.
- `npm run build` — succeeds.
- `npm run test:e2e` — 256 passing.
- **In a real browser**, which is how two bugs were found. Chromium with a
  fake microphone, at 900px and at 360px, stepping through all four
  states plus pause. Fixed: the stop button was grey where the sheet has
  it blue, and at 360px the placeholder wrapped to a second line and was
  cut off — a textarea sizes to its content and a placeholder is not
  content, so the field stayed one line tall while the text needed two.
  The placeholder is now its own layer and says less where there is less
  room.

## What is still open

- Safari remains unverified on a real device, as it was for 04-009. The
  recording path re-encodes audio precisely because Safari's format is one
  Google cannot read, and it is unit-covered, but nobody has run it on an
  iPhone.
- The stepper's third step, "Ready to send", is shown as pending
  throughout rather than completing, because the composer leaves the
  listening state the moment the transcript lands. It reads as a promise
  of where the words are going, which is what it is.

## What was removed

`ChatComposer`, `VoiceInputButton` and `Waveform` are deleted — nothing
used them once the composer replaced them, and leaving them would have
left two ways to build the same thing. The browser recogniser helpers they
carried moved to `voice/recognition.ts`, where they sit beside the rest of
the voice code rather than inside a deleted button. The `wh-mic-idle`
animation went with them.

## Where the code lives

- `packages/core/src/components/ui/talk-composer.tsx` (+ its test) — the
  component and the state machine.
- `packages/core/src/components/ui/use-speech-to-text.tsx` — the
  microphone, provider or browser.
- `packages/core/src/components/ui/use-live-voice.tsx` — now with pause
  and resume.
- `packages/core/src/voice/recognition.ts` — the browser recogniser's
  hand-written types.
- `apps/web/app/ai/assistant.tsx` — one component where there was a
  composer, a status bar and a toggle.
