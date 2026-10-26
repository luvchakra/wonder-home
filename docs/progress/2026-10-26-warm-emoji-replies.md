# Warm emojis on WhatsApp and HomeTalk replies

**Asked** (the owner, 2026-10-26): "use emojis wherever you can, keep it professional, friendly, cheerful, helpful and suggestive." Where: WonderHome's own WhatsApp replies and HomeTalk's replies (which also reach WhatsApp). Not screens.

## What changed
- **WhatsApp words** (`packages/core/src/i18n/messages/areas/whatsapp/*.ts`, all eight languages): one emoji per message, at the start or end. "Got it 👍", what was found by kind (🎒 school, 🏅 a class outside school, 📅 event, 🛒 groceries, 🧾 bill or receipt, 🩺 health document, 🤔 not sure), 🎙️ when a voice note may be misheard, ✅ added on its own, ⚠️ unsupported, too large, empty or kept in Failed safely, 🔗 connected (replaces ✓), ⏳ code expired, 💬 "ask HomeTalk in the app". The unknown-sender reply opens with 👋. A composed acknowledgement is at most two: "Got it 👍 I found a bill. 🧾 When is it due?" HomeTalk's `whatsapp.ask.*` questions stay plain, so the composed message never carries three. Still no amount, health detail or number is echoed.
- **HomeTalk** (`packages/core/src/conversation/warmth.ts`, applied in `apps/web/app/_lib/hometalk-turn.ts`): after a reply is composed, validated, hedged and corrected, `warmReply` leads a confirmation with what was done (🛒 list, ⏰ reminder, 📅 event, 🍽️ meal, 🗓️ away, else ✅), leads a greeting 👋, a place 📍 or a screen 👉, closes an ordinary answer with 😊, and leads a prepared or awaiting-approval preview with 📝. The Undo line is now "Say **undo** to take it back ↩️"; a successful undo leads with ↩️. Never on a question, a refusal, a failed action, the "Why?" evidence, or a reply whose action or facts carry health, a child or money. No model is asked for an emoji, so `homebrain/validate.ts` and the prompts are unchanged (the eval's prompt hash is the same).
- **Translation**: an emoji is a protected token in `protectForTranslation` (`reply-language.ts`), so a translated reply keeps it exactly.
- **Speech**: `speech.ts` already strips emoji; `warmth.test.ts` proves an emoji'd confirmation and answer speak cleanly.
- "You could also…": the engine's existing suggestions are in its questions ("For example …", "You can also add them yourself on the Groceries screen"), which stay as they are; no new suggestion was invented.

## Verified
- `npx vitest run packages/core/src`: 4,880 passed; `apps/web`: 54 passed. Exact-string WhatsApp and HomeSend expectations were updated to the new words first.
- `npm run typecheck`, ESLint on `hometalk-turn.ts`: clean. `npm run build -w apps/web` and `npm run check:bundle`: pass.
- `npm run eval` (deterministic, all 194 cases): 194/194, Unsafe Action Rate 0/23, every gate as before. The provider run was not made: the eval runs `converse`, not the turn layer that adds the emoji, and no prompt changed, so it would measure nothing this change touches.

## Open
- Nothing needs a person. No migration; nothing applied live. The help guide doesn't quote these replies, so its words are unchanged.
