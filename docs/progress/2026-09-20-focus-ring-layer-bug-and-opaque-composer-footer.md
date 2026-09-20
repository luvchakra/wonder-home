# The blue focus box, and the message showing through the composer

## What was done

Two more pieces of direct feedback on `/ai`.

### The blue box around the composer's text field was a real, sitewide bug

`apps/web/app/globals.css` had:

```css
:focus-visible {
  outline: 2px solid var(--wh-primary);
  outline-offset: 2px;
}
```

written directly after `@import "tailwindcss"` — not inside an `@layer`
block. In Tailwind v4, un-layered CSS always wins over every layered rule
(including all of Tailwind's own generated utility classes), regardless of
where it sits in the file. The chat composer's textarea already had
`outline-none` in its own class list — it just could never take effect,
because the global rule outranked it structurally, not by specificity or
source order. The same was true of `search-bar.tsx`'s search field, which
has the identical `focus-visible:border-[var(--wh-primary)]
focus-visible:outline-none` opt-out pattern for the same reason (a border
colour change instead of a boxed outline) — it had the same latent bug,
just never reported.

Fixed by wrapping the rule in `@layer base`, Tailwind's own documented
place for exactly this kind of global base style — a component's own
focus-visible utility can now actually override it, as every one of them
already assumed it could. Checked every other component using
`outline-none` or its own `focus-visible:` utility (`Pill`, `Button`,
`Field`, `PasswordField`, `ActionRow`, `NavDrawer`, `ViewerMenu`, `Sheet`,
`Toast`, the Google sign-in button, the help-guide search) — all of them
either match the same default outline (no visible change) or, like the
composer and search bar, were quietly losing their own explicit intent to
this bug; none of them was relying on the bug to look right.

### The composer's sticky footer had no backdrop of its own

Screenshots showed an assistant reply's text visibly bleeding through
behind the disclaimer line under the composer. The sticky footer
(`apps/web/app/ai/assistant.tsx`) wrapped the composer pill and the
disclaimer text, but the wrapper itself had no background — only the
composer's own white pill was opaque. The gap above the pill and the
disclaimer row below it sat on nothing, so whatever had scrolled to that
point in the page showed straight through. Gave the whole footer wrapper
`.wh-glass` — the same translucent-blur backdrop the header and tab bar
already use for exactly this — plus rounded corners and a little padding,
so it reads as one deliberate panel instead of a pill floating with leaky
edges around it.

## Verified

`npm run typecheck`, `npm run lint`, `npm run lint:boundaries`,
`npm run brand -- --check`, `npm run tracker -- --check`: pass.
`npm run test` (workspaces): 82 files / 1129 tests pass.
`npm run test:e2e`: 252/252 pass, including the keyboard-focus test in
`shell.spec.ts` — unaffected, since it never depended on the buggy
override. `npm run build`: clean production build.

Both fixes were also checked visually: the focus-ring fix is a
deterministic CSS-cascade-layer change (verified by reasoning through
Tailwind v4's documented layering, not something that needs a screenshot
to confirm); the footer backdrop was checked with a standalone Playwright
screenshot reproducing the exact scenario from the report (a long message
scrolled to sit directly behind the footer) — the message is fully
illegible behind the glass panel and the disclaimer text reads cleanly on
top of it.

## Still open

Nothing tracked; direct response to reported feedback.

## Where the code lives

`apps/web/app/globals.css`, `apps/web/app/ai/assistant.tsx`.
