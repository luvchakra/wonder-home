# 2026-11-20 — HomeTalk's talk button never does nothing

## Report
The owner: "tapping on talk button not working on one account" (works on the other), WonderHome selected in the live engine picker, on `wonderhome.vercel.app` at phone width. The button is the round waveform button in HomeTalk's composer (`TalkComposer` → `LiveTalkProvider.start("wonderhome")` → `useLiveVoice`).

## Cause
**Why nothing showed (a code defect, fixed):** every way WonderHome's own live loop can fail — a microphone refused for the site, a browser that can't listen, or the voice route (`/api/v1/households/{id}/voice`) refusing — ended the session through `onError` → `LiveTalkProvider`'s `notice`. That notice is drawn only in the live bar, and the bar is hidden on `/ai`. So on HomeTalk a failed start flashed "getting ready" and went back to idle with no words. With no speech provider, the "no recogniser" path did not even call `onError`.

**Why one account and not the other (checked on production):** a QA home on Pro, signed in at `home.wonderapps.biz` and posting a clip to the voice route, got "No speech service is configured" whatever its settings. Production has no platform Google speech key, and neither "Asmi Family" home has its own key. So both homes listen **in the browser** (`webkitSpeechRecognition`), and the 5-member home's saved Google settings (Hindi + Bengali alternatives on `latest_short`) are not involved today. In the browser path the old code, on a browser without `SpeechRecognition`, set "unsupported" and said nothing. The owner's screenshot shows no dictation microphone button, which is hidden exactly when the browser has no recogniser. A refused microphone (per web address) ended silently the same way. That points at the browser and site the failing account is used in (a WebView or in-app browser, a browser without speech recognition, or the microphone blocked for the site), not at the account's data. The fix makes the tap name which one it is.

**Latent, fixed too:** Google's V1 table lists Bengali, Gujarati, Punjabi and Urdu with `command_and_search` / `default` only, not `latest_*`. One such alternative makes Google refuse the whole request (400). So the moment a speech key is added, the 5-member home would have lost voice. `google.ts` now drops alternatives the model can't hear, and for such a primary language it listens with `command_and_search`.

## Fix
- `packages/core/src/voice/live-failure.ts`: sorts a failure into `denied` / `unsupported` / `setup` (voice route 400/402/403) / `failed`; `VoiceRouteError` carries the route's status.
- `use-live-voice.tsx`: reports the kind with every failure, including the old silent "no recogniser" path.
- `live-talk.tsx`: forwards each failure to the registered page (`onFailure`), as well as the bar's notice.
- `google.ts`: `modelFor` / `modelHears`, with tests in `google.test.ts`.
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
- The owner should tap the button again on the failing account once this is live, and read the sentence. "The microphone is blocked" → allow it in that browser's site settings. "This browser can't listen" → open the site in Chrome itself, not inside another app. If a home should listen through Google instead of the browser, an Admin adds a speech key in Settings → Voice.
- QA data: the E2E spec creates and deletes its own household and user. The production check made QA user `829c4d79…` and home `e9eb64a7…`; both were deleted in the same run.
