# The AI tab becomes "Talk", the chat stops jumping, and the mic loses its halo

## What was done

Four pieces of direct follow-up feedback on `/ai`, after the previous
activity's mic redesign and sticky-footer fix:

1. **The tab is now "Talk", with a microphone icon.** The primary nav's
   `ai` entry (`packages/core/src/navigation/primary-navigation.ts`) had
   label `"AI"` and a `sparkles` icon; both are now `"Talk"` and `mic`
   (`packages/core/src/components/shell/primary-nav.tsx`'s `ICONS` map
   updated to match). The nav item's `key` stays `"ai"` — that's an
   internal identifier, not label copy, and changing it would have
   touched every `active="ai"` call site for no reason.

2. **No more visible scroll on opening the tab.** Reopening a
   conversation with history animated a smooth scroll from the top of the
   page down to the latest message on every load — the "scrolling
   effect" reported. Two causes, both in `assistant.tsx`:
   - `scrollIntoView` was called with `behavior: "smooth"`. Switched to
     `behavior: "instant"` — not `"auto"`, because the page has a global
     `scroll-behavior: smooth` (`apps/web/app/globals.css`) that `"auto"`
     would still have honoured.
   - Both the scroll-to-end effect and the sticky footer's height
     measurement (the `ResizeObserver` added last activity) ran in a
     plain `useEffect`, i.e. after the browser had already painted once.
     Moved both to `useLayoutEffect`, so the very first frame a reopened
     conversation paints is already scrolled to the end with the right
     footer clearance, rather than painting at the top (or with no
     clearance) and then snapping into place a moment later.

3. **The last message's last line sits above the composer**, which was
   actually the previous activity's `footerRef`/`ResizeObserver` fix
   working as intended — the flash described in point 2 was the visible
   symptom of it not yet having measured when the page first painted; the
   `useLayoutEffect` change above is what makes that clearance present
   from the first frame instead of a moment later.

4. **The mic's idle halo is gone.** The screenshot showed a soft blue ring
   surrounding the microphone button — the `wh-mic-halo` pulse-ring added
   last activity for "aliveness", now visible for what it actually reads
   as: a blue box around the input. Removed the halo `<span>` from
   `VoiceInputButton` entirely, along with the now-unused `.wh-mic-halo`
   keyframe rule and its `prefers-reduced-motion` entry in
   `ui-theme.css`. The button keeps its own subtle idle breathing
   (`.wh-mic-idle`, a gentle scale/saturation shift on the button itself,
   nothing extending past its edges) and its retro grille texture and
   glassy highlight.

## Verified

`npm run typecheck`, `npm run lint`, `npm run lint:boundaries`,
`npm run brand -- --check`, `npm run tracker -- --check`: pass.
`npm run test` (workspaces): 82 files / 1129 tests pass.
`npm run test:e2e`: 252/252 pass. `npm run build`: clean production
build. The mic button's appearance with the halo removed was re-checked
with the same standalone Playwright screenshot technique as the previous
activity, confirming no ring around the button.

## Still open

Nothing tracked; direct response to reported feedback.

## Where the code lives

`packages/core/src/navigation/primary-navigation.ts`,
`packages/core/src/components/shell/primary-nav.tsx`,
`packages/core/src/components/ui/voice-input-button.tsx`,
`packages/core/src/ui-theme.css`, `apps/web/app/ai/assistant.tsx`.
