# WhatsApp: HomeBrain's model decides what each message is (2026-11-22)

Follows #626 (rules-only fix for "hello" → Failed safely). The owner then set the direction: "any kind of
message should be analysed by ai and proper response should be given, all intelligence code should be in
HomeBrain".

## What changed
- One HomeBrain entry point, `homebrain/intake/channel-decide.ts` `decideChannelMessage`: the household's
  model reads every WhatsApp message (typed text, a voice note's transcript, a file's caption) and picks a
  kind and a route: `hometalk`, `homesend`, or `both` (a file or forward with words that ask). `checkedRoute`
  enforces that a file, photo or forward is always kept, and that a typed line is never "both".
- `homebrain/intake/channel-decider.ts`: the model per household, with the same key resolution and data-use
  routing as the HomeSend reading. It is wired into the webhook, the dispatch tick and the retention drain
  (`apps/web/app/_lib/whatsapp-hometalk.ts` `whatsappDecider`).
- With no model, or a failed call, the rules decide (`homebrain/intake/channel-route.ts`). They now also
  cover corrections ("no, it's on the 12th"), Hinglish questions ("kal ka plan kya hai") and emoji-only messages.
  When there is no model, a file whose caption asks or requests is kept and its caption answered.
- The routing heuristics moved out of WhatsApp: `isForHomeTalk`, `isQuestionForWonderHome`,
  `groceryListNames`, `namesTheSameThing`, `isShortNote`, `isBareDetail`. The boundary test now fails if
  `whatsapp/` or `homesend/` defines routing rules, and requires `intake.ts` to call `decideChannelMessage`.
- Kept and answered: a file with a caption like "remind me to pay this", or a forward whose words ask, is
  filed in HomeSend and its words are answered by HomeTalk in a second message.
- Product fix found by the live eval: a real model read "milk?" as "add milk to the groceries". A lone thing
  with a question mark is now a question (`conversation/engine.ts` `asksAboutAThing`).
- HomeTalk rules: "👍"/"🙏" are thanks, and "kal/aaj ka plan kya hai" gets the day's calendar.

## Verified
- Unit: `homebrain/intake/channel-decide.test.ts` (model first; rules with the decider null, failing or
  throwing; the keep-what-was-sent invariant), WhatsApp intake (the model's small-talk reading; a forward
  kept and its question answered with no model), boundary tests. Suites run: whatsapp, homebrain/intake,
  conversation, evaluation and notifications/whatsapp, 1662 tests.
- Eval HT-310–326 (greetings, thanks, emoji, a voice question, "milk?", Hinglish, a correction follow-up,
  a forwarded document with a question, "remind me about this" with an image, a scam forward, "hello" with
  no model): 17/17 deterministic, 17/17 live provider.
- `npm run build -w apps/web` and `check:bundle` clean.

## Open
- The model call adds about a second to each WhatsApp text that gets past the open-question check.
- The three messages lost in the outage were never stored and can't be recovered.
