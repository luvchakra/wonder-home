# HomeTalk and voice: where the time went, and making it faster

2026-10-18. The owner reported that voice replies take a long time.

## What the record showed

Every assistant turn stores its own timings in `conversation_messages.metadata.timings` (`understand`, `compose`, `total`, and `quick` when the rules read the sentence). These are the live project's last three days of turns, all on the app surface:

- **Turns that needed the model to understand them:** understanding took 3.4–5.6 s and composing 2.8–11.7 s, for totals of 4.2–15.6 s.
- **Turns the rules read (`quick`):** understanding took about 20 ms, but composing still took 3.5–12.0 s.
- **Regenerations:** some answers regenerated once after validation (`brainValidation.attempts: 2`), which doubled the compose time.

**Where the time goes.** Nearly every second is two model calls made one after the other. Both ran on the main model. For Anthropic that defaults to `claude-opus-5`, already at `effort: "low"` with prompts of about 1,500 tokens (too small for caching to help). The server voice loop then adds about 1.2 s of end-of-speech silence, speech-to-text, and synthesis of the **whole** reply before any of it plays.

## What changed

- **Tiered models** (`ai/model-client.ts`):
  - Understanding a sentence, a structured classification into a fixed schema, runs on `claude-haiku-5-5`.
  - Composing the answer and translating it run on `claude-sonnet-5-5`.
  - HomeSend's document reading keeps the main model.
  - Each tier is set by `WONDERHOME_AI_UNDERSTANDING_MODEL` or `WONDERHOME_AI_ANSWER_MODEL`, or for all of them by the existing `WONDERHOME_AI_MODEL`, without a deploy.
  - Nothing about authorization changes. Every gate, validator and approval runs on the output as before, and a failed call is still recorded as `understandingFailure` rather than hidden.
- **Speech starts sooner** (`use-live-voice.tsx`, `conversation/speech.ts` `speechChunks`):
  - The reply is synthesised in pieces of whole sentences, all requested at once.
  - The first piece plays as soon as it is ready while the rest are still being made.
  - Before, nothing played until the whole reply had been synthesised.
- **Gemini Live** benefits from the model change. Each of its tool calls runs the same HomeTalk turn.

## Verified

- Typecheck passes.
- Tests pass: AI, conversation, voicelink, evaluation and components (903), including new `speechChunks` tests.
- `npm run eval` passes 113/113, with the voice gate passing.
- The model capabilities used (structured outputs and `effort`) were checked against the model reference for Haiku 5.5 and Sonnet 5.5. Neither request sends sampling parameters, which Haiku 5.5 rejects.
- **Not measured here:** this sandbox has no Anthropic key, and using a household's or the deployment's key for testing is not ours to do. The new timings will show in the same `metadata.timings` once deployed. Compare a day of turns before and after.

## Still open

- Measure the deployed effect from `metadata.timings`.
- **More can be done if needed:**
  - stream the composed answer straight into speech;
  - skip the regeneration on spoken turns and answer deterministically instead;
  - shorten the 1.2 s end-of-speech wait.
