# WhatsApp "typing…" while WonderHome works, and a spoken question about buying

2026-10-26. The owner asked whether WhatsApp could show WonderHome typing while a reply is on its way, and showed a voice note with no reply visible.

## What was built

- **"typing…" on WhatsApp.** `showWhatsAppTyping` (`packages/core/src/notifications/whatsapp.ts`) sends Meta's typing indicator, checked against Meta's current docs (`status: "read"`, `message_id`, `typing_indicator: {type: "text"}`; reply `{success: true}`; cleared by the reply or after 25 s). It marks the message read too. It never throws and has a 4 s timeout; a failure is `refused` or `unavailable`.
- **When.** `processWhatsAppMessage` (`packages/core/src/whatsapp/intake.ts`) shows it as soon as a linked member's message is picked up, before the 8 s burst wait, the voice-note transcription and the HomeTalk/HomeSend work. Once per burst: only the run of the burst's first message shows it (`waitsOnEarlierMessage`); the run that claims the burst keeps it alive. Never for an unknown sender or a connect code (they never reach processing) or an already-answered row. Shown once more after `TYPING_REFRESH_MS` (20 s) only while the run is still working; `say()` and the run's end stop it, so never after the reply or a failure. Never awaited: it cannot delay the reply.
- **Telemetry.** `typing_shown` / `typing_failed` in `whatsapp_events` (migration `20261026200000_whatsapp_typing_events.sql`). Safe in either order: if the live check still refuses them, `recordWhatsAppEvents` writes the batch again without them.

## The 8:19 PM and 8:20 PM voice notes (investigated on the live project)

Status, reasons and timings only.

- **20:19:13 IST.** Picked up 4 s later, transcribed and answered by HomeTalk (`question_answered`, `ack_sent`); WhatsApp accepted the reply at about 20:19:40, **27 s after sending**. Nothing failed: the reply came late, with no sign of life in between. That is what "typing…" now fixes. The event recorded `latency_ms` 5,671 because latency was measured to the start of the run, not the reply. **Fixed:** latency is now taken when the reply is sent.
- **20:20:53 IST**, "Show me the to buy shopping cart for groceries" (the owner's words, from their screenshot). Heard correctly, but filed in HomeSend as "Not sure yet". **Cause:** the word "buy" made the transcript count as a paying/ordering instruction, which needs 0.9 confidence. Gemini's transcripts carry a fixed 0.8, so the note was "uncertain" and never reached HomeTalk. **Fixed:** `heardForHomeTalk` lets a spoken *question* clear the everyday bar (0.75), since a question only asks and HomeTalk never pays or orders by voice. A spoken instruction to buy still needs 0.9 and is still checked in HomeSend.

## Verified

- `npx vitest run packages/core/src/whatsapp/whatsapp-intake.test.ts`: all pass, including 12 new tests (request body; shown before the wait; once per burst; never for an unknown sender or a connect code, or an answered row; refused, unreachable or hanging typing still gets the reply out; refreshed only while working; none after failure; latency at reply; spoken question about buying goes to HomeTalk; an instruction to buy at 0.8 still waits).
- Typecheck and lint on the changed files; help-link lint.
- Vercel runtime logs were refused to this session (the team needs re-authorising for the connector), so the investigation used `whatsapp_messages`, `whatsapp_events` and `home_send_items` on the live project.

## Open

- The item made from the 20:20 voice note still waits in HomeSend; the owner can remove it there.
- Live check after deploy: send a WhatsApp message and look for `typing_shown` in `whatsapp_events`.
