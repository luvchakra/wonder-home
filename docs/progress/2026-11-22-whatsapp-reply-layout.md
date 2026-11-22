# WhatsApp replies laid out like HomeTalk in the app (2026-11-22)

The owner: "WhatsApp message formatting can be better, make it same as HomeTalk message formatting". He compared "so what's cooking" (22 Nov, 9:54 PM IST) in the app and on WhatsApp.

## What was found
- **Content.** Not the scopes: `WHATSAPP_SCOPES` (= `DEFAULT_VOICE_SCOPES`) opens `meals.read` and `groceries.read`, so the WhatsApp turn sees the same meal plan, template and grocery facts as the app. The wording differences (two grocery items vs one, the missing "I can't see who is cooking…" line) come from each ask being a separate model composition. The live eval (`npm run eval -- --utterance …`) could not run here: the container has no provider key. Identical wording is not a goal; the layout is now deterministic.
- **Closing line.** Not truncation: the reply was about 500 characters, far under `MAX_WHATSAPP_REPLY` (1,500). The model left it out on that ask.
- **Rendering.** `whatsappReplyText` kept single newlines (cramped list), wrote links as "Label (full URL)", and left a line the model wrapped inside an item as a loose paragraph.

## What changed
- `conversation/reply-format.ts` `parseReply`: a line between two bullets with no blank line is folded into the item above it; after the last bullet it stays the closing paragraph. The app's `ReplyText` gets the same fold.
- `whatsapp/hometalk.ts` `whatsappReplyText` now renders from `parseReply`: `*bold*`, "• " items, a blank line between items when any item is longer than 40 characters (short lists stay one a line), blank lines around a list, links kept as their short label in the sentence and each app screen written once at the end as "Label: https://…" (deduped, with `navigate`), map links in full where they stand. A long reply drops whole items from the end of the middle, keeps the opening and closing lines, and adds "The rest is in the WonderHome app."; one long paragraph still ends at a sentence.

## Verified
- `npx vitest run` on `evaluation/channel-parity.test.ts` (owner's fixture, word parity, spacing, fold, footer, truncation), `whatsapp/whatsapp-intake.test.ts`, `conversation/reply-format.test.ts`, `conversation/reply-style.test.ts`, `homebrain/say.test.ts`, `homesend/talk.test.ts`: all pass.
- `packages/core` typecheck clean.

## Open
- A live two-run comparison of "so what's cooking" needs a provider key; run `npm run eval -- --utterance "so what's cooking"` twice where one is configured.
