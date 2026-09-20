# Talk: a faster turn, and replies that actually use bullets

**Date:** 2026-09-20 · **Kind:** performance pass on the conversation turn (NFR: p95 ≤ 800 ms for ordinary writes excluding provider latency), plus a reply-format fix · follows the Household Brain and formatted-replies notes

## What was wrong

The first brain-composed answer in production took 5.2 s end to end and
came back as bold and links with no bullets: the model separated its
thoughts with single newlines, which the parser folded into one block, and
it never chose a list for the four things it mentioned. The turn itself
was serial: routing → model call to understand → read the whole home →
model call to compose, with the member message and metering written in
between.

## What changed

**Two model calls become one for a plain question.** The rules read "what's
going on in my home", "where do you need my attention" or a hello with
certainty; asking a model to confirm that changes nothing downstream, since
the answer comes from the Household Brain either way. When the
deterministic reading is `ask_status` or `greet` at ≥ 0.8 confidence, the
route skips the understanding call and goes straight to composing.
Everything else still goes to the model to be understood.

**The home is read while the request is understood.** `householdAgenda`
and `householdContext` start right after routing, in parallel with
`converse`, rather than after it. The agenda now shares the brain's
45-second per-household memory (`householdMemory`), forgotten together with
the context after any write. The deterministic status fallback and the
composed answer are computed in parallel too.

**Recording and metering run alongside the answer.** The member's message
insert and `consume` no longer sit between the request and its
understanding; both are awaited before the reply is recorded, so ordering
is unchanged.

**No hidden thinking on Gemini.** `gemini-flash-latest` thinks before
answering by default, which adds seconds; both the understanding and the
composing calls now pass `thinkingConfig: { thinkingBudget: 0 }`.
Translating one sentence into a small object, and writing 120 words from a
list of facts, need none of it.

**Timings in the reply metadata** — `timings: { understand, compose,
total, quick }` in milliseconds, so the next look at production says where
a slow turn went instead of guessing.

**Bullets, for real.** The parser treats every line as its own paragraph
(models separate thoughts with single newlines as often as blank ones), and
the format description now says: one line of the overall picture, then a
bullet list whenever two or more separate things are mentioned — each with
the thing in bold, its detail and its link — with a worked example of the
shape.

## Expected effect

For a plain question: one provider round trip instead of two, the home
read hidden behind it, and no thinking budget spent — roughly a 5 s turn
becoming a 1.5–2.5 s one on the same provider. For a request ("add milk"),
the understanding call remains and now overlaps with the home read.

## Verified

- `reply-format.test.ts` updated for paragraph-per-line; all core suites,
  `npm run typecheck`, `lint`, `test`, `build`, `test:e2e` — see the PR.
- Not verifiable here: the live timing. The next production turn's
  `timings` are the measurement.

## Still open

- Streaming the composed answer token by token would cut perceived latency
  further; it is a bigger change to the composer and the chat screen.
- The 45-second memory is per warm instance; a cold function re-reads.
