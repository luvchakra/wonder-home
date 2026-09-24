# HomeTalk composer: two rows and a live-engine picker

**What.** The HomeTalk composer (`packages/core/src/components/ui/talk-composer.tsx`) now follows the new mockup:

- The words sit on top at full width.
- One row of controls sits beneath: `+` (HomeSend, replacing the paperclip), a pill naming who runs a live conversation, the microphone, and Send.
- Tapping the pill opens a menu (a Radix `DropdownMenu` radio group) with exactly two options, **WonderHome** and **Gemini Live**. The mockup's Claude and ChatGPT pills were left out on request. A typed turn's model is still the household's AI-key setting, not something the composer chooses.

**Rules.**

- **The starting choice.** The picker starts from the household's Voice setting (`liveEngine`). A member's switch is kept only in that browser, under `wh:live-engine:<householdId>`. The household default is still an Admin's decision in Settings.
- **When Gemini Live is offered.** Gemini Live can be picked only when `geminiLiveGate` says it can run. Otherwise it shows as disabled, with the server's own reason. A choice saved on a device never outlives the gate: it falls back to WonderHome.
- **Server-side checks.** The token route re-checks every condition on each session, so this is a preference and not authorization.
- **Visibility.** The picker only appears where a live conversation is available (flag plus plan), because a picker for something that cannot start would be a control that does nothing (rule 10).
- **Phone sizing.** On a phone the round controls are 40px, so the row fits 360px without clipping Send (rule 15).

**Also fixed.** On a short phone, the HomeTalk empty state (orb plus suggestion chips) could not scroll. It pushed the composer's controls under the tab bar and clipped the orb under the header. It now scrolls inside its own area and centres itself with `m-auto` when there is room.

**Verified.**

- `npm run typecheck`, `npm run lint` and the composer's unit tests pass.
- Driven in Chromium at 360×780 and 1280×860 against a QA household on the `max` plan with `WONDERHOME_FLAG_VOICE_CONVERSATION=on`:
  - no horizontal scroll;
  - Send is fully inside the viewport;
  - the composer sits clear above the tab bar;
  - the menu lists WonderHome (selected) and Gemini Live. Gemini Live was disabled with "Gemini voice needs a Google AI key…" because the sandbox has no Google key.

**Open.** Gemini Live being selectable was not exercised in a browser here, since that needs a Google key. The path is the same `DropdownMenu.RadioItem` with `disabled` false.

**QA cleanup.**

- QA user `2be1ace0-4bf1-4691-911f-3ecf5b0f0564` was deleted.
- QA household `d430f18f-36a3-46f2-8d66-1edfe7342086` was deleted, along with its subscription row.
