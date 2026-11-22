# WhatsApp: greetings and plain questions go to HomeTalk (2026-11-22)

## What happened
The owner's WhatsApp "hello" (9:00 PM, after #621/#624/#625 restored WhatsApp) was answered
"⚠️ I kept that. WonderHome couldn't read anything in it. It's in HomeSend under Failed safely."

Cause: WhatsApp's talk-or-keep rules (`whatsapp/hometalk.ts`) knew questions, everyday requests and
yes/no/undo, but no greeting, thanks or small talk. "hello" went to HomeSend; the model answered
(the key was visible) that there was nothing to keep (`readable: false`), so the item was marked
failed `unreadable`. A second gap: the rule `any\b` missed "anything due this week".

The three earlier messages (4:55 PM "whats are the upcoming stuff", 5:49 PM "whats the plan",
8:38 PM "hi") arrived while the webhook was refusing deliveries. They were never stored and can't be
recovered; nothing was fabricated for them.

## What changed
- `homebrain/intake/channel-route.ts` (new): talk or keep, by rules, no model. Small talk (hello, hi,
  thanks, good morning, ok, bye, help), questions (now including "anything", "anyone", "upcoming") and
  everyday requests → HomeTalk; files, photos, forwards, links and multi-line text → HomeSend.
  `whatsapp/hometalk.ts` now delegates to it.
- Safety net in `whatsapp/intake.ts`: a short typed line the reading still finds nothing in is set aside
  (`setAsideAsConversation`, archived as `unreadable`, never in Failed safely) and HomeTalk answers it.
  "Couldn't read" now only follows a file.
- HomeTalk greeting (`conversation/proposal.ts`): "Hello! Send me anything — a bill, a school notice,
  a reminder — or ask what's coming up."
- "whats the plan", "what's coming up", "whats are the upcoming stuff" read as the week's schedule
  (`conversation/rules.ts`, `calendar/answer.ts` `ASKS_WHAT_IS_ON`), the same answer as "what's on this week".
- "hi there" is a greeting (the filler strip had left "there").
- Stale AI-key alerts: the dispatch tick now reads saved settings before `tellPlatformAdmins`, so
  `supersedeStaleKeyAlerts` is not skipped on a cold server (it returns 0 until settings are read).

## Verified
- Unit: `homebrain/intake/channel-route.test.ts` (router with no model), `whatsapp/whatsapp-intake.test.ts`
  (six messages answered with a classifier that throws; the safety net), rules, calendar, proposal,
  reply-style, clarify, welcome, alexa, evaluation and boundary tests: all pass.
- Eval HT-310…HT-317 (WhatsApp door): 8/8 deterministic, 8/8 live provider.
