# Sidebar logout, setup tab order, HomeTalk avatar — plus three new CLAUDE.md rules

**Date:** 2026-09-22
**Trigger:** A curated subset of a larger UI/UX review the user asked to be grouped by module first, then implemented in a separate, explicit "implement this" message — four items across three unrelated screens, plus three cross-cutting rules to record in CLAUDE.md for future work.

## What was done

**CLAUDE.md — three new design-principle rules (20–22):**
- **Rule 20**, a choice is picked, not typed: any field whose answer is a known set (category, relationship, unit, status, frequency) is a dropdown/tag picker/radio/checkbox, never free text — and the picker always carries its own "add a new value" path. This documents a pattern several earlier stories (Groceries' `ComboboxField`, story 121–123/155–157) already built; the rule generalizes it as the standing expectation for every future CRUD form.
- **Rule 21**, a card opens to its full detail: a down chevron is the one consistent way a summary card expands to its full actionable detail — matches the existing `ExpandableRow`/`AgendaExpandableRow` pattern already used across Family, Househelper, Home & Upkeep, Certification and Groceries (story 98, 119, 124, 132, 144, 158).
- **Rule 22**, money is decimal, always: amounts are entered and shown in major currency units (42.50, never 4250) everywhere in this product's own UI and domain logic; conversion to a minor unit happens only at a boundary that genuinely needs it (a payment provider's own API), never displayed to a person.

These are process rules to hold future work against, not a retrofit of existing screens — no existing form or amount field was found to violate them during this pass, so no code changes accompanied rules 20–22 beyond the CLAUDE.md text itself.

**Sidebar: Logout moved into the avatar popup, Get Help removed from the nav drawer.**
- `packages/core/src/components/shell/nav-drawer.tsx`: the standalone `<form action={signOut}>` sign-out row at the bottom of the drawer, and the "Get Help" `SidebarLink` above it, are both gone. `LifeBuoy`, `LogOut` and the `signOut` import were dropped with them (no longer referenced in this file).
- `packages/core/src/components/shell/viewer-menu.tsx` (the avatar popup, top-right of the mobile header and desktop bar): gained a "Log out" `DropdownMenu.Item` at the very bottom, below a new separator — a `<form action={signOut}>` wrapping a submit button, styled in `--wh-risk` (red), following the same "real POST, not a link" pattern the drawer's old form used (session-cookie test convention). `ViewerMenu` already listed "Get Help" in its own `ITEMS` array before this change, so nothing about `/help`'s reachability changed on that side.
- Reachability check (done before editing, not assumed): `/help` remains directly linked from `ViewerMenu` itself, `/more`, `/settings`, `/legal`, and the public landing page header/footer — removing the drawer's own row does not orphan the route.

**Manage Household: "Who does what" is now the second setup-wizard tab.**
`apps/web/app/household/setup/page.tsx`'s `STEPS` array reordered so `responsibilities` ("Who does what") sits right after `family`, before `playbook` ("Playbook"). Every step panel and the `done()` helper key off `step.key`, not array position, so this was a pure reorder with no behavioral risk — confirmed live (`Family, Who does what, Playbook, Policies, Connections, Just tell me`).

**HomeTalk: removed the circular avatar beside assistant messages.**
`packages/core/src/components/ui/ai-message.tsx`'s `ChatMessage` no longer renders `AiOrb` next to an assistant bubble. `AiOrb` itself is untouched and still used for the 88px quiet-state hero above an empty conversation and in the landing page's mockups — only the 32px per-message instance was removed. Assistant vs. member turns stay visually distinct without it: alignment (`flex-row`/`items-start` vs `flex-row-reverse`/`items-end`), bubble background (neutral surface vs filled primary), and the flat corner on the speaker's own side all remain.

## What was verified

- `npm run verify` — typecheck, lint (4 lint scripts), tracker, brand assets, the P0 security suite (9/9 areas), unit tests, `test:db` (RLS/migrations against a from-scratch local Postgres), production build, and 344 Playwright e2e tests — all green. (First run reported a false green: the local Postgres cluster was down, `test:db` failed everything with "connection refused", but the invoking shell command piped through `tee` and only reported `tee`'s own exit code, masking the real failure. Started the cluster with `pg_ctlcluster 16 main start` and re-ran without the pipe — genuine exit code 0 this time, confirmed by grepping for `build`/`test:e2e` sections actually present in the log.)
- Live browser verification with a temporary QA household (`node scripts/qa-test-user.mjs create`, onboarded through `/welcome` since a freshly created auth user has no household yet) at 360px and desktop (1440px): nav drawer no longer shows a "Get Help" row or a sign-out form (asserted 0 matches in both, screenshotted); the avatar popup shows "Log out" in red at the bottom on both viewports; the setup wizard's tab strip reads `Family, Who does what, Playbook, Policies, Connections, Just tell me` in that order at both viewports; `/ai` (HomeTalk) shows no circular avatar beside the assistant's pending-reply bubble. QA user deleted afterward (`qa-test-user.mjs delete`), dev server stopped.

## What's still open

- No existing screen was found to violate rules 20–22 during this pass, but the sweep was not exhaustive across all 22 backlog modules — a future story that touches a free-text field for a known-set value, a summary card without a chevron, or a minor-unit money display should be held against these rules as it's found, not assumed already compliant everywhere.
- `design/DESIGN-NOTES.md`'s nav-drawer section and its `AiOrb`/`ChatMessage` kit-table row were both updated to describe the current behavior.

## Where the code lives

- `CLAUDE.md` — rules 20, 21, 22.
- `packages/core/src/components/shell/nav-drawer.tsx` — Get Help row and sign-out form removed.
- `packages/core/src/components/shell/viewer-menu.tsx` — Log out item added.
- `apps/web/app/household/setup/page.tsx` — `STEPS` reordered.
- `packages/core/src/components/ui/ai-message.tsx` — `ChatMessage` no longer renders `AiOrb`.
- `design/DESIGN-NOTES.md` — nav drawer section and the `AiOrb`/`ChatMessage` kit-table row updated.
