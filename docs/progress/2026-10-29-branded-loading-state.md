# Branded loading state

**Why.** Owner: while a signed-in screen loads it showed only pale grey bars and felt dead. Asked for a nice animation with the WonderHome logo.

**What.** `ScreenLoading` (`apps/web/app/_components/screen-loading.tsx`, used by every `loading.tsx`) keeps its skeleton structure, so nothing moves when the screen arrives, and gains a veil on top:
- the one mark (`BrandMark`, `brand/mark.ts`) breathing on a soft card with a slow halo ring;
- one handwritten line (`ScriptAccent`, design rule 2): "Just a moment, setting things up for home…";
- the existing skeleton shimmer is unchanged.

Pure CSS in `packages/core/src/ui-theme.css` (`wh-breathe`, `wh-halo`, `wh-veil-in`; transform and opacity only), no client JS, no new dependency, no new hex. The veil is fixed, takes no room, waits 150 ms before fading in (a fast load never flashes it) and under `prefers-reduced-motion` is still and simply visible.

**Words.** New `loading` area (`loading.label`, `loading.script`) in all eight languages. A loading screen can't know the reader's language without reading headers (which would stop it being prefetched), so every language's line is rendered and CSS shows the one `<html lang>` names; the signed-in shell sets `lang` on mount, so in-app navigation is in the member's language, a cold first load in English.

**Verified.** Typecheck, eslint, i18n tests, `npm run build -w apps/web`, `npm run check:bundle` green. In a browser (dev server, temporary delayed route, not committed): 360 px and 1280 px, no horizontal overflow, mark animating, only the English line visible.

**Open.** Owner to watch a real load on their phone and say calmer or livelier. The `aria-label` on the status region is English until the shell sets the language.
