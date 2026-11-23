# Nightly E2E, 23 Nov: the talk button with Gemini Live, and wonderapps.biz

Run 45097115782 (`e2e-nightly.yml`, head f41cba4) failed: 3 failed, 2 flaky, 2 not run. The night before (feeffa4) was green.

## 1. `hometalk-talk-button.spec.ts` › a browser that can't listen says so [mobile]: a product bug

**Cause.** #630 (owner, 2026-11-22: voice "switched on by default") made Gemini Live the engine for every member who never chose one. The spec's member never chose, so the tap went to Gemini Live. Gemini Live opens the microphone itself and showed the browser's own error, "Requested device not found", instead of the one-sentence reason and next step that WonderHome's own engine gives. Two more defects turned up while fixing it:

- `use-gemini-live.tsx` passed `getUserMedia` errors through raw, with no failure kind, so the composer couldn't word them in the viewer's language.
- HomeTalk (`ai/assistant.tsx`) cleared its error when the composer's state turned "live". A browser that refuses the microphone at once (a site already blocked, a phone with no microphone) reports before that state lands, so the reason was erased and **the tap said nothing**. That is the owner's 2026-11-20 complaint, "tapping on talk button not working", coming back on the new default engine.

**Fix (product).**
- `use-gemini-live.tsx`: a microphone the browser can't open is sorted with `voice/live-failure.ts` (`denied`, `unsupported`, `failed`) and passed on with its kind. "This browser cannot hold a live conversation" is `unsupported`. Gemini's own messages are unchanged.
- `talk-composer.tsx` has a new `onLiveStart`, called on the tap before any engine runs. HomeTalk clears its last message there, not on the "live" state.

**Spec (follows the owner's 2026-11-22 decision, #630).** The three recogniser cases test WonderHome's own engine, so the member now chooses it (`household_members.live_engine = 'wonderhome'`). Two new cases cover the default, Gemini Live: a microphone refused for this site says how to allow it, and a phone with no microphone says "This browser can't listen." and never "Requested device not found". No assertion was loosened.

## 2. `landing.spec.ts` › every footer link goes somewhere that exists [mobile, desktop]: needs a person

`https://wonderapps.biz` answers **402 Payment required, DEPLOYMENT_DISABLED**: Vercel has disabled the `wonder-apps` project's deployment. No code in #626–#636 touches this. The test is right: the footer (and `/legal`) link to a site that is down. The owner re-enables or redeploys the `wonder-apps` project on Vercel (team `kunals-projects-9f64757f`). This session's Vercel connector can't see that project (404). The test is unchanged and will stay red until the site is back.

## Flaky (passed on retry): seen, not fixed here

`help.spec.ts` › signed-in guide not cached, and `hometalk-composer.spec.ts` › desktop composer: both stayed on `/sign-in` with the form filled after the "Sign in" click on the first try. This is a sign-in race that existed before #626–#636. It is left as an open follow-up.

## Verified

- `npm run test:e2e -- e2e/hometalk-talk-button.spec.ts e2e/landing.spec.ts` (live project, `E2E_SERVER_SERVICE_KEY=1` as the nightly): all 5 talk-button cases pass. The landing footer case fails only on wonderapps.biz → 402.
- Typecheck: pass. `npm run lint`: 0 errors. `vitest run packages/core/src/components/ui packages/core/src/voice`: 264 pass.
- Cleanup: the spec deletes its own user and household. A check found 0 `talk-*` E2E users and 0 "E2E Talk household" rows left.
