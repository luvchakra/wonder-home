# Seven new UI rules, and the four fixes they came with

## What was done

The user gave two rounds of general UI feedback in the same session and asked
for each to be written into `CLAUDE.md` as standing design principles, then
applied to the actual codebase rather than left as policy alone.

**Round one (principles 11–13):**
1. Never truncate an entity's name — give rows more room, put actions behind
   icons with an accessible label instead of full-width text buttons.
2. Every entity keeps add, update and remove options.
3. The assistant is one door (the tab bar's raised mic/AI button, reachable
   everywhere), not a separate "Ask AI" / "Talk to WonderHome" shortcut
   bolted onto each screen or row.

**Round two (principles 14–17), triggered by a screenshot of the Groceries
screen showing "Add something" and "Tell WonderHome" as two buttons that both
just add a grocery item, and the closing `QuoteCard` line visually sitting
under the raised AI tab button:**
14. No two buttons for the same job — an AI-routed shortcut next to a manual
    one for the same action is a duplicate, and the AI-routed one goes.
15. Show the whole thing, don't clip it — for values generally (round one's
    rule 11 was scoped to names), and for vertical space too: fixed chrome
    must reserve real clearance for what sits near it.
16. A full-width horizontal swipe moves between the five primary areas
    (Home, Today, AI, Family, More), additive to the tab bar and sidebar.
17. A screen's sections and actions are ordered by what the reader is
    deciding, not by where there happened to be room.

## What changed in the app

- **`packages/core/src/components/ui/action-row.tsx`** — `ActionRow` and
  `NavRow` (the shared row every domain screen is built from) no longer
  truncate the title or meta line. This was the actual root cause of rule 11
  being violated almost everywhere at once: one shared component, not
  twenty-one screens each doing it themselves.
- **Members & roles** (`household/members/page.tsx`,
  `_components/member-role-control.tsx`, `_components/remove-member-control.tsx`) —
  the name no longer truncates; "Make admin" / "Remove admin" and "Remove"
  are now icon buttons (`ShieldCheck`/`ShieldOff`, `UserRoundX`) with
  `aria-label` and `title`, not full-width text.
- **Groceries** (`groceries/page.tsx`, `_components/commerce-forms.tsx`) —
  removed the duplicate "Tell WonderHome" header pill and the "Add
  something" empty-state link that both routed to `/ai` next to the real
  `AddConsumableButton`; the empty state now offers the same manual button.
  `ConsumableRowControls`' "Edit" / "Stop tracking" pills are now icon-only
  (`Pencil`, `Archive`) with accessible labels naming the item.
- **Bottom tab bar clearance** — the raised assistant button
  (`-mt-5`, `size-12`, `ring-4`) pokes above the flat tab bar's own top edge.
  The page's bottom padding and the toast viewport's offset both used to
  guess this gap independently (`+1.5rem`, `+1rem`) with no shared source.
  Added `--wh-tabbar-raised-clearance` (`packages/core/src/ui-theme.css`) as
  the one place that gap is defined, and pointed `AppShell`'s `<main>`
  padding and the toast viewport at it, so they can't drift from each other
  or from the button's real geometry again.
- **Swipe navigation** — new `packages/core/src/navigation/use-primary-swipe-nav.ts`
  (a pure `resolveSwipeTarget` decision function, unit-tested, plus the
  touch-handling hook) and `packages/core/src/components/shell/swipe-main.tsx`
  (a small client boundary wrapping `AppShell`'s `<main>`, so the shell
  itself stays a Server Component). A full-width horizontal swipe moves to
  the next/previous item in `PRIMARY_NAVIGATION`. It backs off before
  committing to navigate when the touch started inside a form, an editable
  field, or an element that wants the horizontal gesture for itself (a
  horizontally scrolling carousel); a sheet or dialog is excluded for free
  since Radix portals them outside `main`. Uses `document.startViewTransition`
  for the page change when available and `prefers-reduced-motion` is off,
  otherwise a plain navigation.

## Verified

- `npm run typecheck`, `npm run lint`, `npm run lint:boundaries`,
  `npm run lint:migrations`, `npm run lint:embeds`, `npm run lint:secrets`,
  `npm run tracker -- --check`, `npm run brand -- --check`,
  `npm run security` — all pass.
- `npm run test` (workspaces + scripts): 82 files / 1129 tests pass,
  including the new `use-primary-swipe-nav.test.ts`.
- `PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres npm run test:db`:
  211/211 RLS tests pass (unrelated to this change; run as part of the full
  gate).
- `npm run build`: clean production build.
- `npm run test:e2e`: 252/252 pass, mobile and desktop projects.

The tab bar clearance fix was checked with a standalone Playwright harness
against the exact CSS values (not the live authenticated app — no local
Supabase/auth session was available in this environment) reproducing the
`ActionRow`/tab bar geometry; a static layout check like that cannot
reproduce a mobile browser's dynamic viewport behaviour during an
address-bar show/hide, which is the likelier proximate trigger for the
reported overlap. The larger, single-source clearance value is a direct
mitigation either way and removes the drift between `main`'s padding and
the toast viewport that existed before. Confirming pixel-for-pixel on a real
device is a reasonable follow-up if the overlap recurs.

## Still open

- Rule 11 (no truncation) has not been swept across the rest of the app —
  `ActionRow`/`NavRow` are now fixed everywhere they're used, but several
  screens still truncate a name or label with their own one-off `truncate`
  class outside those two components (viewer menus, calendar items, the
  timeline, `more/page.tsx`, `settings/page.tsx`, and others). Left out of
  this batch to keep the diff to what was actually reported; worth a
  dedicated pass.
- Rule 13's two remaining flagged exceptions (`bills/page.tsx`'s per-row
  "Pay" pill, `meals/page.tsx`'s per-row "Change meal" pill, both routed
  through `/ai` with no manual alternative yet) are unchanged — building the
  manual pay/edit flow that would replace them is its own feature, not a
  duplicate-button fix.
- Rule 17 (order by what the reader is deciding) was not applied as a
  standalone pass across every screen; it mainly shows up here as the
  natural result of removing the duplicate/AI-routed buttons.

## Where the code lives

`packages/core/src/components/ui/action-row.tsx`,
`packages/core/src/ui-theme.css`,
`packages/core/src/components/shell/{app-shell,swipe-main}.tsx`,
`packages/core/src/components/ui/toast.tsx`,
`packages/core/src/navigation/use-primary-swipe-nav.ts` (+ `.test.ts`),
`apps/web/app/household/members/page.tsx`,
`apps/web/app/_components/{member-role-control,remove-member-control,commerce-forms}.tsx`,
`apps/web/app/groceries/page.tsx`, `CLAUDE.md`.
