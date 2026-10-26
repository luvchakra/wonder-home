# WhatsApp: a spoken question goes to HomeTalk, not Failed safely

**Defect (the owner, 2026-10-26):** "it was able to hear the WhatsApp voice note, but put it in Failed safely." The live row (`home_send_items`, source `whatsapp_media`, `audio/ogg`) had the transcript "What are upcoming events" and `failure_reason = unreadable`.

## Cause
`processWhatsAppMessage` (`packages/core/src/whatsapp/intake.ts`) checked only a *typed* message for HomeTalk (`isForHomeTalk`, `homeTalkAwaitsAnswer`). Every voice note went straight to `ingestWhatsAppMedia`, which wrote it down and read it as something to keep. A question has nothing to keep, so it failed as unreadable and the person was told "I kept that… Failed safely".

## Fix (owner-approved design: HomeTalk is the one door for conversation; HomeSend reads things to keep)
- A WhatsApp voice note is written down **before** any HomeSend item exists (`hearWhatsAppVoiceNote` in `homesend/ingest.ts`, with the same checks as a file: real audio, under the length limit, through the safety scan).
- A transcript heard surely (`gateTranscript` → `confident`) is then read exactly like a typed message: a question, an everyday request ("add milk") or an answer to HomeTalk's open question goes to HomeTalk through `deps.ask`, and its reply is sent. Nothing is uploaded and no item is made. If HomeTalk can't answer, the same "ask in the app" reply as for text.
- HomeTalk gets it as speech (`modality: "voice"`, the transcript confidence), under the same `WHATSAPP_SCOPES` (the default voice scopes), so paying and ordering stay out, and the engine's own transcript check still applies (`apps/web/app/_lib/whatsapp-hometalk.ts`).
- Anything else (a notice read aloud, a spoken note about a bill) stays HomeSend content as before, and the transcript already made is handed back, so it is heard once.
- An unsure transcript is never sent to HomeTalk: it goes to HomeSend's "check what it heard" path unchanged.

## Verified
- `whatsapp-intake.test.ts`: four new cases — a spoken "What are upcoming events" is answered by HomeTalk with nothing in HomeSend; a spoken "add milk" goes to HomeTalk; a school notice read aloud is one HomeSend item, heard once; an unsure transcript goes to check-what-it-heard and never to HomeTalk. HomeSend, WhatsApp and notification suites: 870/870.
- `npm run typecheck` clean; ESLint on the changed web file clean.
- `npm run eval` (deterministic): 187/187, unsafe actions 0/23, every gate that decides passes.

## Open
- The owner's existing Failed safely rows that are really questions ("What are upcoming events", "undo", "whats plan for the morning") are left in place; tidying them waits for the owner's yes.
