# HomeSend: corrections by kind, and why a voice note is not written down

Date: 2026-10-25

## Why

- The 95% auto-add bar rests on 28 golden cases. Before the bar can be set per kind, the owner needs to see which kinds people correct.
- A WhatsApp voice note still failed with no reason in the logs. The 2026-10-25 change logged the thrown errors, but two silent paths remained.

## What changed

- **`homesend/metrics.ts`**: new `correctionByKind`, the correction count split by what each confirmed item was read as. It is computed from columns the metrics already read (`classified_kind`, `review_corrected`), so no migration is needed. The platform route `/api/v1/platform-admin/homesend-metrics` returns it with the other figures.
- **Not done, on purpose:** saving an anonymised copy of each correction as a golden case. A household's words would then leave the household, which is a privacy decision for the owner. The golden set grows by hand from reviewed, anonymised examples.
- **`homesend/ingest.ts`**: two silent paths now log their reason through the existing `logNotTranscribed` (service, mime type, size, reason; never audio or words):
  - `unavailable`: no Gemini key, no data-use policy, or a data-use agreement that excludes Google. The household sees "Voice notes need a speech service, and none is set up yet." This path logged nothing before.
  - A thrown error in the transcription call, caught in `hearVoiceNote`. It was swallowed before.

## Verified

- `npx vitest run packages/core/src/homesend/ packages/core/src/whatsapp packages/core/src/voicelink`: 32 files, 580 tests pass.
- `npm run typecheck -w packages/core` passes.
- The new metrics test covers the per-kind split.
- ESLint did not run: its config fails to load in this container.

## Open

- The voice-note cause is still unconfirmed. Read the next `[homesend] voice note not transcribed` line in the production logs: `service` and `reason` say which path it was.
- A per-kind auto-add threshold needs the owner's decision once `correctionByKind` shows a kind with enough corrections.
