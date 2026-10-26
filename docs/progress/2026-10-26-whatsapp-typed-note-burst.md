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

## Second case, same PR (the owner resent the test, 21:07–21:08 IST)
The notice was sent again at 21:07:55 and correctly answered "That's already in HomeSend" (a duplicate of the 21:04 item, which is still `classified`). "for Manan" was sent at 21:08:02 and reached WonderHome at 21:08:04, after the notice had been read at 8 s. It became its own HomeSend item and was `failed`, so the reply was "⚠️ I kept that… Failed safely".
- **A note on a message already on record** (`itemOnRecord`, `noteOnItem`): the item is matched by the same content hash HomeSend uses for duplicates.
  - Still waiting: the note's who (one member it names) and any day, time or amount the item's kind asks for go onto it, read the way HomeTalk reads an answer. Reply: "Got it 👍 That's already in HomeSend — I've noted it's for Manan."
  - Added, dismissed or undone in the last week: "That one's already been handled ✅ You can change who it's for in HomeSend." Nothing changes.
  - Never a new item either way.
- **A lone bare detail** (`isBareDetail`: nothing but a name, a day or time, an amount and filler words) that joins nothing and answers no open question is never a HomeSend item and never Failed safely. Reply: "Sorry, I didn't catch what that's about 🤔 Could you send the message it goes with?" "2 litres mustard oil" alone is still content.
- New words `whatsapp.ack.duplicateFor`, `.duplicateNoted`, `.duplicateHandled` and `whatsapp.noteAlone`, in all eight languages. Events use the existing kinds (`duplicate`, `question_redirected`), so no migration.
- **Left for the owner:** the stray item from 21:08 (`ae64740f-3542-46d6-8ea1-aed5cf441e67`, status `failed`) is in Failed safely. They can dismiss it there; it was not deleted.

## Verified
- `whatsapp-intake.test.ts`, with expected results written first:
  - the owner's case (note arriving during the wait), the same delivery, and note-first in either run order: one item, one reply, no who question;
  - "Asmi Sunday" fills who and the day;
  - the note's run defers, then stops;
  - "add milk" and "what's for dinner?" are two HomeTalk answers;
  - "for Manan" 45 s later goes through rule 2;
  - a resent notice plus "for Manan": the waiting item is set to Manan, with one reply and no new item;
  - a resent notice already added plus a note: "already handled", and nothing changes;
  - a lone "for Manan": no item, a polite reply, never Failed safely;
  - `isShortNote` and `isBareDetail` cases.
- The existing forward + note tests are unchanged. One expectation changed on purpose: "a fresh message waits a moment" now waits `[6000, 7000]`.
- Tests for whatsapp, homesend, hometalk, i18n and help: 729 passed. `npm run typecheck`: clean. `npm run eval` (deterministic): 196/196, Unsafe Action Rate 0/23. The provider run wasn't made: no prompt or engine change.

## Docs
- Design §3.1 rule 1, §9 (speed) and §12 I-24 (`docs/hometalk-homesend-design.md`).
- Help, Connections ¶3: "a note sent straight after a message, a forward or a photo", in all eight languages.

## Also looked at
The emoji now in WhatsApp replies ("🎒", "✅") come from #374 (`2026-10-26-warm-emoji-replies.md`), which the owner asked for: the `whatsapp.*` catalog words and HomeTalk's `conversation/warmth.ts`. They are not a defect, and nothing was changed.

## Open
Nothing needs a person. No migration. No QA data was created; the live project was only read.
