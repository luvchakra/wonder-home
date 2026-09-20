# The assistant asked the same question four times (story 04-011)

## What was broken

From a real conversation:

> **Kunal:** I want you to add 3 egg for order and packet of milk for order
> **WonderHome:** What would you like me to order?
> **Kunal:** I just said 3 eggs and packet of milk for order
> **WonderHome:** What would you like me to order?
> **Kunal:** I just said order 3 X and packet of…

Two separate failures stacked on each other.

**The request never parsed.** The order rule was anchored on the verb
coming first — `^(?:order|reorder)\s+(.+)$` — so it matched "order 3 eggs"
and nothing else. "I want you to add 3 eggs for order" is how a person
actually asks, and it fell straight through to a low-confidence intent
with no items, which asks a clarifying question.

**Nothing remembered the question.** Every turn was understood from
scratch. The answer was never connected to the question, and nothing
noticed the same words had already failed. So the loop could run forever,
and the person who had been perfectly clear was the one made to feel
unclear.

## What it does now

**A clarifying question is a promise to use the answer.** When a turn asks
one, what it was asking about — the action, what had already been
understood, the exact words used — is recorded on the assistant message
that asked it. The next turn reads that first and folds the answer into
the original intent, before any other interpretation is attempted.

**The same question is never asked twice.** If the answer still does not
resolve it, the second reply must differ: it says what was understood,
names exactly what is missing, and shows the shape of an answer that
works, with a way out that is not talking to it again.

> I still cannot tell which items you mean. Name them one by one and I will
> add them — for example "3 eggs, 1 packet of milk". You can also add them
> directly on the Groceries screen.

**It hears past frustration.** "I just said", "I already told you", "no,
I just said" — a person only says these when the product has failed them,
so they appear in precisely the turns that matter most. They are stripped
before anything is read, and never mistaken for the thing being ordered.

**Where it goes is not what it is.** "milk for order" must never become an
item called "milk for order". Destinations — for order, to the shopping
list, on the grocery list — are removed before the list is split.

**The rules learned how people actually ask**, so most of this never
triggers: "I want you to add X for order", "can you add X to the shopping
list", "put bread and jam on the grocery list" all now parse first time,
with the items extracted from anywhere in the sentence.

One deliberate judgement: an answer that resolves a clarification is
treated as **confident** (0.9). Somebody who has now said the same thing
twice has been clear, and treating a repeated answer as still uncertain is
exactly what made this loop.

## What is deliberately still cautious

- **Changing the subject mid-question is allowed.** An utterance that does
  not answer the question is not forced into it. Swallowing "what needs
  attention" as an answer would add it to the groceries, which is worse
  than asking again.
- **Only the very last message is checked.** A question two turns ago has
  been overtaken, and treating it as open is how an assistant ends up
  answering something nobody is asking any more.
- **Nothing here bypasses a gate.** The completed intent goes through the
  same entitlement, autonomy and approval path as any other, and a payment
  still needs a yes.

## What was verified

- `npm run typecheck`, `npm run lint` — clean.
- `npm run test` — 91 files, all passing. 23 are new, including the
  screenshot's conversation run end to end through `converse`: the first
  ask now parses, an answer to a question is used rather than re-asked,
  a still-unresolved answer gets a *different* reply, and the question is
  closed once answered.
- `npm run build`, `npm run test:e2e` — succeed, 256 e2e passing.

Not verified: the live path against a real model provider. The fix is in
the deterministic layer on purpose — it has to work when a provider is
slow, refused or unconfigured, which is exactly when a household is most
likely to be repeating themselves.

## Also in this change

The live-conversation caption that said "tap the waveform to pause, or the
cross to end" is gone. The status bar already says "Tap to pause" and
carries a cross; the caption was explaining a control that explains
itself, and the space under the composer is tighter for it.

## Where the code lives

- `packages/core/src/conversation/clarify.ts` (+ its test) — filler
  stripping, item extraction, answering a question, and the escalated
  second ask.
- `packages/core/src/conversation/engine.ts` — reads the answer first,
  refuses to repeat a question, and hands the next clarification back.
- `packages/core/src/conversation/rules.ts` — the widened order phrasings.
- `packages/core/src/conversation/repository.ts` — `pendingClarification`.
- `apps/web/app/api/v1/households/[householdId]/conversation/route.ts` —
  carries it between turns.
