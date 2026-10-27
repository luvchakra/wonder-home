# "Add maps link" answers a place question; a swiped "Skip" reaches HomeTalk (24-015, 25-041)

2026-10-27. Defect from the owner's WhatsApp test, 14:54–14:55 IST: "find the issue here and fix".

## What happened (live project, UTC; status and timings only)
- 09:24:45 message e34f3bba (text, not quoted): `ignored`, no HomeSend item, `question_answered` in 14.5 s. HomeTalk answered "where can we go this weekend" from the calendar and asked "How much maps link should I add?" with a Skip button.
- 09:25:17 message 54f0e2e5 (text, **quoted**: `reply_to_provider_message_id` set): `processed`, HomeSend item 66b981e8, `message_processed` + `homesend_created` in 13.2 s, then failed safely as unreadable. No HomeTalk turn.
- Item 66b981e8 is already `dismissed` (09:38 UTC). Nothing was deleted.

## Causes (verified)
1. `splitRequest` cut the sentence at ", add" into "where can we go this weekend" and "add maps link"; the rules' "add X" read "maps link" as a grocery and grounding asked how much. "Where can we go" named no kind of place, so the first half was no place question either (the calendar answered it).
2. Rule 2 (the answer to HomeTalk's open question) skipped every message with `reply_to_provider_message_id`. #388 (merged 15:26 IST, after the test) made a tapped button read as typed words and sent a lone "skip" to HomeTalk; a swiped reply quoting HomeTalk's question ("2 packets") still went to HomeSend, because HomeTalk's own WhatsApp message ids were never kept.

## Fix
- `conversation/decompose.ts`: a part that only asks how the answer is given ("add maps link", "add the map links too") stays with the part before it.
- `conversation/rules.ts` `notAThingToBuy` (links, URLs, maps, directions, locations) keeps the "add X" / "need X" rules off them; `engine.ts` turns a model's `add_to_list` of only such things into `unknown`. "add milk" still asks how much.
- `homeplaces/request.ts`: "where can we go" is going out; "this weekend" is `weekend` (the coming Saturday, or today at the weekend, `service.ts` `windowFor`); "maps link", "directions", "links" set `mapLinks`, and `answer.ts` writes each place's Google Maps link into the words (what WhatsApp shows; the app's cards keep theirs otherwise).
- `whatsapp/intake.ts`: HomeTalk's reply id is stored on the message it answers (`hometalk_reply_id`, written apart from the acknowledgement so a database without the column loses only this). A swipe-reply quoting it can be rule 2 (typed and voice); one quoting anything else is read exactly as before.
- Migration `20261027150000_whatsapp_hometalk_reply_id.sql`: the column plus a partial index on (household, member, id). Additive, safe in either order.

## Verified
- Tests written with their expected results first: `whatsapp-intake.test.ts` (quoted reply on HomeTalk's question → HomeTalk, no HomeSend item; quoting something else unchanged; reply id kept; the first two fail without the intake change), `engine.test.ts` (the whole sentence is `find_places` with no how-much; "add maps link" never `add_to_list` from rules or a model; "add milk" asks how much), `decompose.test.ts`, `homeplaces/request.test.ts`.
- `npx vitest run` conversation, homeplaces, evaluation, whatsapp: all pass. `npm run typecheck` clean. `npm run lint:migrations` passes.
- `npm run eval` (deterministic): 211/211, unsafe 0/26, every gate passes; new HT-170 and HT-171.

## Open
- On WhatsApp a place answer carries links only when asked; always adding them there is a choice for the owner.

## Where
`packages/core/src/conversation/{decompose,rules,engine}.ts`, `homeplaces/{request,answer,service}.ts`, `whatsapp/intake.ts`, `supabase/migrations/20261027150000_whatsapp_hometalk_reply_id.sql`. Design: `docs/hometalk-homesend-design.md` §3.1 rule 2, §12 I-31.

## Cleanup
No QA accounts, rows or files created.
