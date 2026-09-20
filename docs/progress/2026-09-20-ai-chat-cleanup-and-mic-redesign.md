# AI chat: overlap fixed, "Try asking" removed, a bigger retro mic

## What was done

The user sent a screenshot of `/ai` with three regions marked for removal:
the sent bubble "Change dinner on 2026-09-20" appearing to render twice —
once overlapping the "Try asking" label, once again overlapping the
composer — and the "Try asking" suggestion-chip strip itself. They also
asked for a more beautiful UI with a bigger, animated, retro-styled
microphone.

### The overlap

`apps/web/app/ai/assistant.tsx`'s sticky footer (the "Try asking" strip,
`ChatComposer`, and the disclaimer line) sits `position: sticky` over the
scrolling message list, but the message list had no bottom padding
accounting for the footer's height — the same class of bug already fixed
for the tab bar's raised button (design principle 15). Right after a new
turn is added, before the smooth-scroll-into-view finishes, the newest
message bubble could render partly behind the footer — exactly the
"duplicate" bubble the screenshot shows. Fixed the same way as the tab
bar: a `ResizeObserver` on the footer measures its real (and
variable — the composer grows with the message, an error banner can
appear) height, and the message list's `padding-bottom` tracks it, so the
two can never drift out of sync again.

### "Try asking" removed

The dismissible "Try asking" strip (added earlier this session,
`docs/progress/2026-09-20-error-boundaries-and-assistant-suggestions.md`)
sat directly in the region the overlap bug hit hardest, and the user
crossed it out along with the glitch. Removed it entirely from the active
conversation — `showTryAsking` state, its `X` dismiss control, and the
three-chip strip are gone. The identical `SuggestionChips` still show once,
large and centered, in the empty "Hi, how can I help?" state before a
conversation starts (design/UI-UX-REQUIREMENTS-v3.md lists this as part of
the conversation experience) — only the persistent below-the-fold repeat
of it is gone.

### A bigger, retro, animated microphone

`packages/core/src/components/ui/voice-input-button.tsx` gets a new `"xl"`
size (76px, versus 44px before) used only by `ChatComposer` — voice is the
product's P0 primary control surface, so it is now the visually dominant
element of the composer rather than a small icon beside the send button.
At that size it also gets:

- a retro touch: a faint concentric ring texture over the gradient dome,
  like an old ribbon microphone's grille, plus a glassy highlight (the
  same trick `AiOrb` already uses) so it reads as a dome, not a flat disc;
- a continuous, slow "breathing" scale + saturation shift at idle (reusing
  the existing `wh-breathe` keyframe) and a slow, dim expanding ring (the
  existing `wh-pulse-ring` keyframe, far slower and dimmer than the
  listening-state version) — "alive and ready", not "recording";
- the existing listening-state pulse and waveform are unchanged in
  behaviour, just bigger.

Deliberately kept on-brand rather than copying a reference image's dark
theme and orange accent verbatim: the mic stays the app's own primary-blue
gradient (`--wh-gradient-primary`) and the AI-tone pulse it already used
while listening (`--wh-tone-ai`), per design principles 1 and 3 ("warm,
never clinical" / "Primary Blue... for every committing action"). Both new
animation classes (`.wh-mic-idle`, `.wh-mic-halo`) are added to the
existing `prefers-reduced-motion: reduce` block in `ui-theme.css`.

## Verified

`npm run typecheck`, `npm run lint`, `npm run lint:boundaries`,
`npm run brand -- --check`, `npm run tracker -- --check`: pass.
`npm run test` (workspaces): 82 files / 1129 tests pass — nothing asserted
on the removed markup. `npm run test:e2e`: 252/252 pass (the only e2e
coverage of `/ai` is the signed-out-redirect check). `npm run build`:
clean production build.

The new mic button's appearance (grille texture, glossy highlight, sizing
against the textarea and send button at 375px width) was checked with a
standalone Playwright screenshot of the real computed styles — not the
live authenticated app, since standing up an authenticated household
session isn't available in this environment; confirmed no overflow at
375px and a legible, correctly-layered result at 3x zoom.

## Still open

Nothing tracked; this was a direct response to reported UI feedback, not
a new backlog item.

## Where the code lives

`apps/web/app/ai/assistant.tsx`,
`packages/core/src/components/ui/{voice-input-button,chat-composer}.tsx`,
`packages/core/src/ui-theme.css`.
