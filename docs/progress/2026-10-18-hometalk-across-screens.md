# HomeTalk follows you across screens (04-018)

**Date:** 2026-10-18 · **Story:** 04-018 (Done)

## What the owner asked

While talking to HomeTalk:
- ask it to go to a screen, such as the grocery list;
- add or remove things there;
- move on to other screens (Home, Responsibilities, Calendar) while the conversation carries on;
- see HomeTalk's glow on every screen while it does;
- come back to the HomeTalk chat whenever they like.

Before this, "go to the grocery list" got the list read out, and leaving the HomeTalk page ended the conversation.

## What was built

### The conversation lives at the root of the app

- `packages/core/src/components/ui/live-talk.tsx` (`LiveTalkProvider`, mounted in `apps/web/app/layout.tsx`) now owns both live engines: WonderHome's own listen/speak loop and Gemini Live. Changing screens no longer unmounts them.
- On HomeTalk's page, the composer configures the session and takes its turns (`register`), so the conversation shows on screen as before.
- On any other screen, a turn goes to the same HomeTalk endpoint from the provider, and the reply is spoken.
- The recap is written when the session ends, wherever it ends. The first message is kept by the provider (`markStart` / `takeStart`).

### Opening a screen: the `open_screen` intent

- **The screens.** `conversation/screens.ts` lists every screen HomeTalk can open, each with a fixed key, its path and the words people use for it. The labels and paths come from the navigation definitions, so they never drift.
- **Who decides which screen.** The rules (`readOpenScreen`) and the model both pick from the keys; the model's `screen` parameter is a closed enum. A path is never taken from what anyone or any model said.
- **Questions stay questions.** "Show me tomorrow's schedule" and "what's on the grocery list?" are still answered. "Show me …" opens a screen only when said as a screen, page or list.
- **Who may open what.** A screen this person is never offered (a child's Bills) is not opened, and the reply says so (`mayOpenScreen`, the same rules as the More screen).
- **Following the reply.** The reply carries `navigate`, a same-app path, on the HomeTalk reply and in its metadata, for a single request and for each part of a request with several parts. The browser follows it on any screen (`safeHref`), typed or spoken.
- **Voice channels.**
  - Gemini Live has a new allowlisted tool, `open_screen`. Its sentence is built from the screen's own words. The `navigate` field travels on the tool result (`hometalk/contract.ts`, `toolResultFrom`), and the page follows it without passing it to Gemini.
  - Alexa has no screen, so it says where to find the screen in the app. This is the new capability policy `on_screen`.
- **Where it is placed.** Capability `screens`; `ACTION_SCOPE open_screen: "none"`; `REPLY_CLASSES open_screen: []`.

### The glow on every screen

- Every screen but HomeTalk's shows a short bar above the tab bar (bottom right on desktop) while a live conversation runs.
- The bar shows the HomeTalk orb, whether it is listening, thinking or speaking, and pause or resume, end, and a tap back to the conversation.
- It glows (`wh-glow`) unless the person asked for less motion.
- Pages and toasts reserve room for it through `--wh-live-bar-clearance` (rule 15). Without that, the bar sat over a list row's stepper in the first check.

## Verified

- **Unit tests.** All 3,330 pass, including:
  - `conversation/screens.test.ts`, 30 tests: phrasings, things left alone, a child refused, a speaker with no screen, no path from input;
  - rule samples and coverage;
  - the contract's `navigate` being a same-app path only;
  - the Gemini tool, its sentence and its result.
- **Evaluation.** `npm run eval` passes 117/117, with 0/17 unsafe actions.
  - New golden cases: HT-84 (grocery list), HT-85 (responsibilities), HT-86 (a child asking for Bills is refused), HT-87 ("what's on the grocery list?" stays a question).
  - Voice gate: 23/23 Gemini sentences and 27/27 actions placed.
- **Other checks.** Typecheck, lint, import boundaries, secret lint, help links, the bundle check and a production build all pass.
- **Browser.** Checked at 360px and 1280px, signed in as this session's QA household, with live voice on (`WONDERHOME_FLAG_VOICE_CONVERSATION=on`). Headless Chrome has no microphone, so a scripted recogniser stood in for one.
  - The script said, in turn: "Take me to the grocery list", "Add bananas to the grocery list", "Open the calendar", "Go back to HomeTalk".
  - The app opened Groceries, added bananas there, opened Calendar, and came back to HomeTalk.
  - The bar showed on Groceries and Calendar and not on HomeTalk. The turns made away from HomeTalk were in the conversation on the way back.
  - There was no horizontal scroll and there were no page errors.

## Needs a person

- Try it on a real phone with the microphone: the speech in and out is the browser's own, which a headless check cannot hear.

## Where the code lives

- **Core:**
  - `packages/core/src/components/ui/live-talk.tsx`;
  - `conversation/screens.ts`, `rules.ts`, `intent.ts`, `proposal.ts`;
  - `hometalk/contract.ts`;
  - `voicelink/gemini-live.ts`, `capabilities.ts`, `scopes.ts`, `readiness.ts`;
  - `ai/model-client.ts`.
- **App:**
  - `apps/web/app/_lib/hometalk-turn.ts` (`screenReply`);
  - `apps/web/app/ai/assistant.tsx`;
  - `apps/web/app/layout.tsx`.
- **Help:** the Voice section, paragraph 7, in all eight languages.
