# WhatsApp: a forward and the note after it are one item

## Why
The owner forwarded a school message ("exam time is 9.30 morning") and typed "asmi Karate Sunday" straight after it.
- WhatsApp delivers these as two messages, and each became its own HomeSend item.
- The note was "I couldn't tell what it's about".
- The exam asked "Who is it for — Manan or Asmi?", though the note had said so.

## What was done
- **A burst is one item** (`whatsapp/intake.ts`). Texts the same person sends within 30 s after a forward, a text or a photo are read with it:
  - the first message waits up to 8 s after it arrived;
  - it claims the later texts (only those not yet started) and passes them on as "The sender added: …", or as a photo's caption;
  - one reply covers the whole burst.
- **Order does not matter.** A later message whose first message has not started yet leaves itself for that one.
  - A second photo or file in a burst stays its own item.
  - A plain name or a question still goes its own way when it was not sent together with something.
- **The classifier reads the note** (`ai/classify-intake.ts` prompt). A name in it is who the item is for, a word like "Karate" is what it is, and a day or time is its date. The note wins over the content where they differ.
- **More ways a time is written:**
  - "9.30 morning", "4 in the afternoon", "7 at night", "6 o'clock in the evening" and "14.30 hrs" are read;
  - "Saturday, 10 am to 12 noon" now keeps its day.
- **Records:**
  - golden case HS-20;
  - tests for bursts in either order, the wait, and the new time forms;
  - help in eight languages and CLAUDE.md.

## Verified
- core and web `tsc` clean.
- 1,377 tests across ai, whatsapp, homesend, evaluation and conversation pass.
- `npm run eval`: 163/163 golden cases pass, with 0 unsafe actions.
- Repository gates and the production build: see the PR.

## Still open
- The owner's two earlier items were read before this; their person and date are set in the review.
