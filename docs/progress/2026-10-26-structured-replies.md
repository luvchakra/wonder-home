# HomeTalk replies laid out for a phone, with emojis throughout

**Asked** (the owner, 2026-10-26, with a WhatsApp screenshot of "milk, eggs and bread" answered by one dense paragraph): "make the responses nicely structured, and use emojis. build these deeply into HomeTalk". Follows #374 (warm emojis).

## What changed
- **One layer for every HomeTalk reply** (`packages/core/src/conversation/warmth.ts`, applied in `apps/web/app/_lib/hometalk-turn.ts` to single turns, each part of a multi-part request, approved actions and undo). After a reply is validated, `warmReply`:
  - leads **questions** with what they are about (🛒 groceries, 📅 events, ⏰ reminders, 🍽️ meals, 📥 HomeSend, else 🤔). Before this, questions had no emoji;
  - leads confirmations (🛒 ⏰ 📅 🍽️ 🗓️ 🔧 📥 … else ✅) and previews (📝), closes a one-line answer with 😊 and leads a longer one with 📋;
  - puts each hint ("For example …", "Or say …", "You can also …") on its own line, the first led by 💡 (`shapeReply`);
  - puts the Undo line ("Say **undo** to take it back ↩️") on its own line.
  Refusals, failures (including "I could not reach my model"), the "Why?" evidence and replies about money, health or a child are still laid out, with no emoji. No model is asked for an emoji, so the prompts (eval prompt hash unchanged) and `homebrain/validate.ts` are untouched.
- **Grocery wording** (`grocery-actions.ts`): the how-much question lists one item per line with what is already on the list, then the example and "that's enough" on lines of their own. Adding or taking off two or more items confirms them as a list. The single-item question bolds the item.
- **WhatsApp**: `whatsappReplyText` already turns `- ` into `•` and `**` into `*`, so the same structure reaches WhatsApp. A test pins the screenshot's question as WhatsApp shows it.
- **Speech**: each line is read as a sentence and emojis are dropped. Tested.

## Verified
- `npx vitest run packages/core/src apps/web`: 4,936 passed. The exact strings of the old dense wording were updated: evaluation, operations and WhatsApp tests, and HT-152's expected answer (an intended wording change, not a gate change).
- Typecheck, ESLint on `hometalk-turn.ts`, `npm run build -w apps/web`, `npm run check:bundle`: pass.
- `npm run eval` (all 194 cases, deterministic): 194/194, Unsafe Action Rate 0/23. No provider run was made: no prompt changed, and the eval runs `converse`, before the layer that adds the layout.

## Open
- "2.502 L" in the screenshot is the stored amount on the list, said exactly (rule 9). It looks like 2.5 L plus 2 ml added later. If it shouldn't be there, edit it on the Groceries screen.
- Not driven in a browser: the in-app renderer (`parseReply`) is unchanged and already shows lines and lists. Check it on a phone once it's live.
- No migration; nothing applied live.
