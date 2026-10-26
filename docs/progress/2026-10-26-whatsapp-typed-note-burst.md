# WhatsApp: a short note typed after a message is read with it

**Reported** (the owner's WhatsApp test, 2026-10-26, 21:04 IST; instruction "fix"): typed "Annual Day rehearsal on Saturday at 9 am. Children must bring a white kurta." then "for Manan". WonderHome asked "Who is it for — Asmi or Manan?", then answered "✅ Got it — that's for Manan…". Expected: one item for Manan, one reply, no question.

## What the live project showed
Status and timings only (`whatsapp_messages`, `whatsapp_events`, project `kqxndableyysxqhxiorz`):

| Message | WhatsApp time | Row created | Status | HomeSend item | Answered |
|---|---|---|---|---|---|
| The notice | 21:04:40 | 21:04:42.6 | processed | yes | 21:04:56.3 (`clarification_requested`, 15.3 s) |
| "for Manan" | 21:04:49 | 21:04:51.3 | ignored (to HomeTalk) | none | 21:05:01.7 (`clarification_answered`, 11.8 s) |

**Root cause.** The suspected cause was that two typed texts are never joined. In fact `claimBurst` joined any fresh messages in the window, typed or not. The real cause was timing. The notice's 8 s wait ended at 21:04:48, but the note was typed 9 s after the notice and reached WonderHome at 21:04:51. So the notice was read alone and asked who. The note's own run settled at 21:04:57, after that question had gone, and rule 2 took it as the answer. A second gap showed up too: any two typed texts sent within 8 s were joined, even "add milk" and "what's for dinner?". That made them one HomeSend item, and HomeTalk never saw either.

## What changed (`packages/core/src/whatsapp/intake.ts`)
- **Typed messages alone** (no forward, photo or file) join only as one message plus the short notes sent with or after it (`typedBurstOf`). Two requests or questions stay apart. Forward, photo and file bursts are as before.
- **A short note** (`isShortNote`): up to 6 words, one line, no "?", not `isForHomeTalk`. It names a household member (first name or nickname), a day or time, or an amount ("for Manan", "Asmi Sunday", "due Friday", "2 litres").
- **The longer wait.** A lone typed message that would go to HomeSend (rule 8, after the HomeTalk rules) waits up to `BURST_NOTE_SETTLE_MS` (15 s) in all, then claims any short notes that arrived (`claimLateNotes`). The note's details reach the reading through the same "The sender added: …" path as a forward's note. One item, one reply.
- **The note's own run** defers to that message (`typedMessageNotedOn`). It waits until the message's 15 s plus 2 s, shows no "typing…" of its own, and stops once the message's run has taken it. If that message was already answered, or is more than 30 s earlier, nothing changes: rule 2 answers HomeTalk's question, as before.
- **Cost:** a lone typed notice for HomeSend now replies up to 7 s later. Questions, requests, answers to HomeTalk, forwards, photos, files and voice notes keep the 8 s wait.

## Verified
- `whatsapp-intake.test.ts`, with expected results written first:
  - the owner's case (note arriving during the wait), the same delivery, and note-first in either run order: one item, one reply, no who question;
  - "Asmi Sunday" fills who and the day;
  - the note's run defers, then stops;
  - "add milk" and "what's for dinner?" are two HomeTalk answers;
  - "for Manan" 45 s later goes through rule 2;
  - `isShortNote` cases.
- The existing forward + note tests are unchanged. One expectation changed on purpose: "a fresh message waits a moment" now waits `[6000, 7000]`.
- `npx vitest run packages/core/src/whatsapp packages/core/src/homesend packages/core/src/hometalk`: 618 passed. `npm run typecheck`: clean. `npm run eval`: see the PR.

## Docs
- Design §3.1 rule 1, §9 (speed) and §12 I-24 (`docs/hometalk-homesend-design.md`).
- Help, Connections ¶3: "a note sent straight after a message, a forward or a photo", in all eight languages.

## Also looked at
The emoji now in WhatsApp replies ("🎒", "✅") come from #374 (`2026-10-26-warm-emoji-replies.md`), which the owner asked for: the `whatsapp.*` catalog words and HomeTalk's `conversation/warmth.ts`. They are not a defect, and nothing was changed.

## Open
Nothing needs a person. No migration. No QA data was created; the live project was only read.
