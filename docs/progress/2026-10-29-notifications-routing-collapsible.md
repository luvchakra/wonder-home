# 2026-10-29 — "What comes to you" card folds like the playbook

## What was done
On **Settings → Notifications**, the **"What comes to you"** card listed every
outcome the viewer owns in one open list. For a household with many
responsibilities the list was a wall that pushed the channels, push-device and
household sections below it off-screen (the owner, 2026-10-29).

The card now **folds**, reusing the exact pattern the playbook cards and the
Manage Household groups already use (`apps/web/app/settings/_household/manage-section.tsx`):
native `<details>`/`<summary>` with the `group` class and a `ChevronDown` that
rotates via `group-open:rotate-180`. Collapsed by default (no `open` attribute),
matching the playbook. The header — tinted `ListChecks` tile, "What comes to
you", and the intro — stays visible as the summary with the chevron on the
right; tapping the header or chevron expands/collapses the owned-outcomes list.
The "Change who owns what in Responsibilities" link stays visible below the fold.

Only the collapsing applies when the viewer owns outcomes (`routing.length > 0`).
When they own none, the card keeps its old non-folding layout (the "none" intro
+ the Change link, no chevron — nothing to fold).

## Why this pattern
- CLAUDE.md requires reusing the existing fold, not inventing one. `<details>`/
  `<summary>` is native, so it needs **no client component** on this server
  page, is keyboard-operable with implicit `aria-expanded` semantics, and needs
  **no new i18n string** (no aria-label added). The summary is `min-h-12` (48px),
  above the 44px target.
- Design principle 17 (group by what the reader is deciding), 11 (names never
  truncated — the summary text div is `min-w-0 flex-1`, the chevron `shrink-0`).

## Files
- `apps/web/app/settings/notifications/page.tsx` — the card (added `ChevronDown`
  import; wrapped the owned-outcomes list in `<details>`). No data path, wording
  or Save behaviour changed.

## Verified
- `tsc -p apps/web --noEmit` clean; `eslint` on the file clean.
- No unit test or E2E spec references this card; none touched.
- UI check at 360px via a static harness of the real card markup + tokens
  (`scripts/ui-check.mjs`): collapsed by default (list absent), expands on
  header click (all eight sample rows appear), `scrollWidth == 360` in both
  states → no horizontal overflow. Before/after screenshot at 360px in the PR.
- No i18n strings added or changed; no guide words; `check:bundle` not affected.

## Open
- None. Presentation-only change on one server component.
