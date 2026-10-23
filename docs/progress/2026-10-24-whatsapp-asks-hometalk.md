# WhatsApp asks HomeTalk (14-040)

## Why
The owner asked for WhatsApp to answer questions itself, through HomeTalk, the way Alexa does,
instead of pointing to the app (2026-10-24, "yes").

## What was done
- **A new HomeTalk channel, `whatsapp`** (`hometalk/contract.ts`). It has its own conversation surface
  (`conversation_sessions.surface = 'whatsapp'`), so what WhatsApp is waiting on is answered on WhatsApp.
- **Which messages go to HomeTalk** (`whatsapp/hometalk.ts`'s `isForHomeTalk`): one short line that
  asks something ("what's on tomorrow?") or makes an everyday request ("add milk to the list",
  "remind me at 5", "remember …"). A forward, a list, a link or a file is still HomeSend.
- **How it runs** (`apps/web/app/_lib/whatsapp-hometalk.ts`):
  - the household and member come from the verified WhatsApp link;
  - the turn runs as that member under their own session (`withMemberSession`), through
    `handleHomeTalkRequest`, the same gateway as Alexa;
  - the WhatsApp message id is the delivery id, so a redelivery replays the first answer.
- **What it may reach** (`WHATSAPP_SCOPES`, capability column `whatsapp`): the same everyday things as a
  new Alexa link (questions, plans, meals, the list, reminders, remembering). A new policy, `kept_off`,
  covers a child's school, health and money, because WhatsApp messages pass through Meta and there is no
  per-member opt-in there. Changing plans and the pantry, paying and ordering stay in the app. Its refusal
  says WhatsApp and links the app.
- **The reply** (`whatsappReplyText`): HomeTalk's own words, with WhatsApp bold and links written out in
  full, plus the screen it opens as a link. A long reply ends at a sentence and says the rest is in the app.
- **Wiring:** `WhatsAppIntakeDeps.ask`, passed from the webhook, the delivery clock and the retention cron.
  Without it, the earlier "ask HomeTalk in the app" reply stands.
- **Records:** migration `20261024100000_whatsapp_hometalk_channel` (applied live) widens the surface,
  channel-event and WhatsApp event checks (`question_answered`). The connected message mentions
  questions, help is updated in all eight languages, and CLAUDE.md is updated.

## Also in this PR
- **A swipe-reply answers its item.** The owner replied "asmi" to an exam photo and got "couldn't read anything". WhatsApp's `context.id` is now kept (`reply_to_provider_message_id`, migration `20261024110000_whatsapp_reply_to`, applied live). A reply that names one household member sets who the quoted item is for: its `subjectMemberName` and its understanding's reference. The review opens with them picked, nothing is applied, and no new item is made.
- **An older notice's year comes from its weekday.** "Tuesday 22nd September", sent in October, was read as 22 September 2027, a Wednesday. The weekday then disagreed, so no day was decided, and the 2:30–3:30 p.m. time was dropped with it. `dayFromDateText` now tries the year before when this year's date has passed and only that weekday fits; a written year is never second-guessed. Golden case HS-17.

## Verified
- core and web `tsc` clean.
- 843 tests across whatsapp, voicelink, hometalk and conversation pass, including:
  - WhatsApp capability cells held to the real gates;
  - school, health and money never reachable;
  - question vs content;
  - reply formatting;
  - ask, fallback and a notice still kept.
- Gates and build listed in the PR.

## Still open
- Live check on WhatsApp once deployed: "what's on tomorrow?" and "add milk to the list".
- Production number waits on Meta business verification (see the 2026-10-24 WhatsApp note).
