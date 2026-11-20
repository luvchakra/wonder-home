# 2026-11-20 — HomeTalk's talk button never does nothing

## Report
The owner: "tapping on talk button not working on one account" (works on the other), WonderHome selected in the live engine picker, on `wonderhome.vercel.app` at phone width. The button is the round waveform button in HomeTalk's composer (`TalkComposer` → `LiveTalkProvider.start("wonderhome")` → `useLiveVoice`).

## Cause
**Why nothing showed (a code defect, fixed):** every way WonderHome's own live loop can fail — a microphone refused for the site, a browser that can't listen, or the voice route (`/api/v1/households/{id}/voice`) refusing — ended the session through `onError` → `LiveTalkProvider`'s `notice`. That notice is drawn only in the live bar, and the bar is hidden on `/ai`. So on HomeTalk a failed start flashed "getting ready" and went back to idle with no words. With no speech provider, the "no recogniser" path did not even call `onError`.

**Why one account and not the other (account data, not confirmed):** the owner's two accounts are in two homes both named "Asmi Family". The 5-member home has saved voice settings with Hindi and Bengali as alternative listening languages, sent to Google as `alternativeLanguageCodes` with the `latest_short` model. The 1-member home uses the defaults, with no alternatives. Google refuses some model and language combinations with a 400, which the voice route passes on and the loop then swallowed. The other candidate is microphone permission blocked for `wonderhome.vercel.app` only (permission is per web address). The fix makes a tap say which one it is. The question went to the coordinator.

## Fix
- `packages/core/src/voice/live-failure.ts`: sorts a failure into `denied` / `unsupported` / `setup` (voice route 400/402/403) / `failed`; `VoiceRouteError` carries the route's status.
- `use-live-voice.tsx`: reports the kind with every failure, including the old silent "no recogniser" path.
- `live-talk.tsx`: forwards each failure to the registered page (`onFailure`), as well as the bar's notice.
- `talk-composer.tsx`: says it through the page's existing error line (`role="alert"`), in the viewer's language (`hometalk.composer.voice*`, all eight languages):
  - denied: "The microphone is blocked for this site. Allow it in your browser's site settings, then tap again."
  - unsupported: "This browser can't listen. Open WonderHome in Chrome, or type instead."
  - setup: "Voice can't be used for this home right now. An Admin can check Settings → Voice."
  - failed: "Voice couldn't start just now. Tap again, or type instead."
  - Gemini Live: its own message, as before on other screens.
- Consent, paying and ordering are unchanged (never by voice).

## Verified
- `npx vitest run` on `voice/live-failure.test.ts`, `talk-composer.test.ts`, `use-live-voice.test.ts`, `i18n/`: all passed.
- `tsc --noEmit` for `packages/core` and `apps/web`: clean.
- New `e2e/hometalk-talk-button.spec.ts` (mobile, 360 px, fake recogniser): the waveform tap shows the unsupported sentence, the blocked-microphone sentence, or opens the conversation (End button), never nothing. `playwright.config.ts` turns on `WONDERHOME_FLAG_VOICE_CONVERSATION` for the E2E server, as in production, so the button is there.

## Open
- The owner should tap the button again on the failing account once this is live. The sentence names the cause: microphone blocked → allow it for `wonderhome.vercel.app` or use `home.wonderapps.biz`; "Voice can't be used for this home" → Settings → Voice, clear the extra listening languages (Hindi, Bengali) and save.
- QA data: the E2E spec creates and deletes its own household and user.
