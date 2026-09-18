# Design system v3: kit, every screen, the assistant, the landing page

**Date:** 2026-09-17 · **Kind:** design / UI

## What was done

`design/UI-UX-REQUIREMENTS-v3.md` and the mockup sheets became the UI
contract (`CLAUDE.md` startup step 5). The product was brought up to it:

- Tokens (warm cream surfaces, navy type, teal actions, one colour per
  domain), Inter self-hosted through `next/font`, a motion layer that
  vanishes under `prefers-reduced-motion`, an installable manifest.
- A thirty-component shared kit under `@wonderhome/core/ui/*`.
- The AI assistant ("talk to"): one engine for voice and text, action
  previews with Confirm / Change / Cancel, "done" never said unless a
  governed tool ran.
- Eighteen screens rewritten; the landing page with device-framed real
  components and no invented prices, quotes, or social sign-in.

The rules the components encode are in `design/DESIGN-NOTES.md`.

## Verified

Unit suite (630 at the time), 160 Playwright E2E including landing overflow
at 360px and the shell's five primary areas at every viewport.

## Still open

- Dark theme tokens exist but no dark design has been reviewed.
- Child Goals tab and MFA/data export are honest "coming" states.

## Where

`packages/core/src/ui-theme.css`, `packages/core/src/components/`,
`apps/web/app/**`, `design/`.
