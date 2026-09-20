# A sustained, hands-free conversation with WonderHome

## What was done

Six related changes to Talk to WonderHome:

1. **The navbar logo is centred.** The phone header's mark and wordmark
   ("WonderHome") sit centred on the bar itself, absolutely positioned
   against a `relative` row rather than in the leftover flex space — the
   hamburger and the bell-plus-avatar cluster are different widths, so a
   plain `flex-1` slot would have pulled it off-centre. A `min-w-0 flex-1`
   spacer keeps the row's other elements exactly where they were.
2. **A spoken message lands in the composer for review**, not sent
   straight through. `ChatComposer`'s microphone result now calls
   `setValue`/`setVoiceConfidence` instead of auto-submitting; editing the
   text by hand clears the voice-confidence flag, so `submit()` still
   tells the server truthfully whether a turn was typed or spoken.
3. **Send moved to the left of the microphone**, in the order a hand
   reaches: type or speak, review, Send, mic.
4. **A toggle sits below Send** for live conversation — the existing
   `Switch` kit component (new; Radix underneath, generic enough for any
   on/off setting), shown only when the deployment's `voice_conversation`
   flag and the household's `conversation.voice` entitlement both allow
   it. Hidden rather than disabled when unavailable (design rule 10).
5. **Turning it on starts a hands-free loop** (`useLiveVoice`): listen,
   send what was heard through the same governed conversation endpoint
   text already uses, speak the reply, listen again — one turn at a time,
   microphone off whenever WonderHome is thinking or speaking so it never
   hears itself. Built entirely on the browser's own `SpeechRecognition`
   and `speechSynthesis` — no credentialed voice provider is invented
   (CLAUDE.md's standing rule on external providers). "Male voice" is a
   best-effort pick (`pickVoice`) from whatever the device's own voice
   list offers; many platforms don't label voices by gender, so it falls
   back to the same-language voice that doesn't read as female, then to
   whatever exists. Each live turn is shown in the existing chat bubbles
   with a small speaker caption above the text — "Priya" / "WonderHome" —
   rather than a separate transcript panel, so the one warm chat surface
   stays the one place a conversation is read, live or spoken turn by
   turn.
6. **Ending the session posts a recap.** Turning the toggle off sends a
   new `summarizeSince` request naming the first message of that live
   session; the server composes a deterministic summary
   (`conversation/summary.ts`) — what was said, and what happens to every
   action that came up, in honest status words (still waiting, approved,
   done, cancelled, failed, expired) — the same "arithmetic over what
   already happened" pattern `status.ts` uses, not a second model call.

## Why

Product-direction v4 asks for "Talk to WonderHome" as a primary control
surface with real back-and-forth, not tap-once-per-question. The
`voice_conversation` flag already existed in `config/flags.ts`, unwired;
this is what wires it up, alongside the smaller Talk-page fixes the user
asked for directly (logo placement, review-before-send, button order).

## What was verified

- `npm run typecheck` — clean across both workspaces.
- `npm run lint` — clean, no warnings.
- `npm run test` — all 86 test files pass, including two new files:
  `conversation/summary.test.ts` (the recap's exact wording, including the
  empty-conversation case) and `ui/use-live-voice.test.ts` (`pickVoice`'s
  language and gender-heuristic fallbacks).
- `npm run build` — production build succeeds.
- `npm run test:e2e` — all 252 Playwright tests pass.
- `npm run tracker -- --check` — no story status changed, so the tracker
  is already current; this is a UI/engine change within an existing story,
  not a new one.

## What is still open

- Live conversation's quality depends entirely on what the browser
  offers: continuous recognition is poor to absent in Safari, and a
  labelled "male" voice is not guaranteed on every platform. Both limits
  are stated in code comments (`use-live-voice.tsx`) rather than hidden.
  A credentialed speech provider (for reliable cross-browser recognition
  and a real chosen voice) is a future decision, not assumed here.
- The Edit-last-message pill is hidden while a live session is active
  (editing mid-hands-free-conversation would be a confusing structural
  jump); it reappears once the toggle is off.

## Where the code lives

- `packages/core/src/components/ui/switch.tsx` — the new `Switch` kit
  component (documented in `design/DESIGN-NOTES.md`).
- `packages/core/src/components/ui/use-live-voice.tsx` (+ its test) — the
  listen/think/speak loop and the `pickVoice` heuristic.
- `packages/core/src/components/ui/voice-input-button.tsx` — exported the
  recognition types/constructor so the live-voice hook can reuse them.
- `packages/core/src/components/ui/chat-composer.tsx` — Send-before-mic,
  review-before-send, and the new `belowSend` slot.
- `packages/core/src/components/ui/ai-message.tsx` — `ChatMessage` gained
  an optional `speaker` caption.
- `packages/core/src/conversation/summary.ts` (+ its test) — the
  deterministic end-of-session recap.
- `apps/web/app/api/v1/households/[householdId]/conversation/route.ts` —
  the `summarizeSince` request.
- `apps/web/app/ai/page.tsx` — computes `liveConversationAvailable` from
  the flag and the `conversation.voice` entitlement.
- `apps/web/app/ai/assistant.tsx` — wires it all together: the toggle, the
  live status bar, the speaker captions, the recap on end.
- `packages/core/src/components/shell/mobile-header.tsx` — the centred
  navbar mark.
