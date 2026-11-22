# HomeTalk in the app on the same HomeBrain decision as WhatsApp (2026-11-22)

The owner: "ensure HomeTalk also connects and talk to HomeBrain and HomeSend in similar way so that experience
on HomeBrain or HomeTalk should be similar". Follows #627 (WhatsApp AI-first routing).

## What changed
- An app turn (source `web`, no open question) now asks the same HomeBrain decision before the engine runs
  (`homebrain/intake/channel-decide.ts` `fileFromTalk`). The model is created in `decideProviderRouting` next to the
  understanding, from the words as they may leave (pseudonymised), and is skipped when the rules plainly read a
  greeting, question or request. Something to keep (a pasted notice, a bill's text) is filed through HomeSend by
  `file_with_homesend` → `ingestText`, the same reading, memory, scam rule and bar as a WhatsApp forward, and is
  not split into parts. Record-first with Undo, consent, money and health, and "1 o'clock" reading as 1pm are unchanged.
- HomeTalk's own filing (`executor.ts` `fileWithHomeSend`): a short line the reading found nothing in is set aside
  and answered "I did not follow that…", never "I kept that … under Failed safely", the same as on WhatsApp.
- Shared rules fallback: a family statement HomeTalk records ("we prefer dinner at 8", "Sunita is off tomorrow")
  now goes to HomeTalk on WhatsApp too. Found by the parity test: before, WhatsApp kept these in HomeSend.
- Eval doors: `door: { channel: "app" }` alongside WhatsApp.

## Verified
- Parity test `evaluation/channel-parity.test.ts`: 21 messages through the WhatsApp door and the app door give
  the same decision and the same answer; only `whatsappReplyText` formatting differs.
- Eval HT-310–329: 20/20 deterministic, 20/20 live provider.
- Tests: conversation, evaluation, hometalk, whatsapp, homebrain/intake and the boundary tests, all passing.
  Web typecheck, service-role lint and boundaries lint are clean.

## Open
- HomeTalk in the app takes no attachments yet. Share and email already go through HomeSend.
- With no model, a short dated statement still differs in path but not outcome: WhatsApp gives it to HomeSend,
  and the app's HomeTalk files it through HomeSend (`file_with_homesend`).
