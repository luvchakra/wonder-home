# "Skip" answers HomeTalk's question, never a HomeSend item (25-040)

2026-10-27. Defect from the owner's Failed safely list.

## What happened (live project, UTC)
- 09:24:45 the member sent "where can we go this weekend, add maps link" on WhatsApp. HomeTalk answered the first part, then asked "How much maps link should I add?" (`add_to_list`, awaiting `quantity`) with one choice, **Skip** (`say: "skip"`).
- 09:25:17 the member tapped Skip. The message row had `reply_to_provider_message_id` set, became HomeSend item 66b981e8 and failed safely as "unreadable". No member turn reached HomeTalk.

## Which case
Case 2: rule 2 never took it. WhatsApp sends a tapped button with `context.id` (the message the buttons sat on); `inbound.ts` stored that as a swipe-reply, and rule 2 skips swipe-replies. `answerQuantity` already read "skip" as `keepAsIs`, and #380's Skip `say` round-trips. Every choice set now has a test proving it.

Seen on the way, not fixed here: "…, add maps link" was read as a grocery to add. Worth a HomeFood follow-up if it recurs.

## Fix
- `whatsapp/inbound.ts`: a tapped button or list row carries no `replyTo`; it reads like typed words.
- `conversation/leave-it.ts`: one list (skip, leave it, never mind, forget it, no thanks, no need, that's enough, that's all, not now…). Read by the amount (`keepAsIs`), HomeSend details (`readDetailAnswer` → skip), the fill-in offer (decline), and in `engine.ts` every other open question (closes: "Okay, I've left it as it is. Nothing was added or changed.", `clarify.ts` `leavesQuestion`). With nothing open and no proposal waiting: "Okay. Nothing is waiting on you, so I've left everything as it is." A waiting proposal still takes "leave it" as a no.
- `whatsapp/intake.ts`: rule 2 with no answer from HomeTalk and a reply of 6 words or fewer → `whatsapp.answerUnread` (polite second ask), never HomeSend. A lone leave-it goes to HomeTalk (`isForHomeTalk`); without HomeTalk wired, `whatsapp.leftAlone`. Both in all eight languages.

## Verified
- `npx vitest run` conversation, whatsapp, hometalk, evaluation, notifications/whatsapp-choices, i18n: all pass (new: choice round-trip for 16 sets, every leave-it word × every set, the WhatsApp tap/skip/unread/lone cases, engine cases).
- `npm run typecheck` clean. `npm run eval -- --cases HT-169` passes.

## Where
`packages/core/src/conversation/{leave-it,clarify,engine}.ts`, `hometalk/detail-answers.ts`, `whatsapp/{inbound,intake,hometalk}.ts`, `i18n/messages/areas/whatsapp/*`. Design: `docs/hometalk-homesend-design.md` §3.1 rule 2, §5, §12 I-30.

## Cleanup
No QA accounts, rows or files created; the live item was dismissed earlier at the owner's request.
