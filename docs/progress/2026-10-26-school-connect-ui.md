# 2026-10-26 — Connect-school screen + channel UI (08-029, 08-031 PR B)

Second of two PRs for the owner's "implement 08-029 and 08-031". PR A shipped the
channel backend (storage, the `school_channel` HomeSend source, ingest). This is
the UI and the poll machinery.

## What was done
The Integrations "School" card was a dead tap. It now opens a real
**Connect-school screen** (`/household/integrations/school`), which Kids &
School's "Connect school" also opens.

- **The screen** (`household/integrations/school/page.tsx`,
  `_components/school-connect.tsx`): leads with **Forward to WonderHome**
  (available now, links to Kids & School — the path that works for any school),
  then the catalog's **portals**, each honest about not being live. An Admin:
  - connects / disconnects a portal (`connectIntegration` /
    `disconnectIntegration`);
  - for a portal with channels, pastes a class-group or notice-board link to
    **track** (recognised and normalised by 08-030's `parseSchoolChannel`),
    optionally about one child, and stops / resumes it.
- **Server actions** (`(auth)/school-actions.ts`): `connectSchoolPortalAction`,
  `disconnectSchoolPortalAction`, `trackSchoolChannelAction`,
  `setSchoolChannelActiveAction` — all Admin-gated (the consent gate), with the
  integrations paths revalidated.
- **The poll orchestrator** (`school/channel-sync.ts` `syncSchoolChannels`):
  pure, port-driven — fetch each channel since its cursor, file each message
  through HomeSend, advance the cursor; a channel with no member to file under is
  skipped, not guessed at. Admin **poll route**
  (`integrations/school/channels/sync`) wires it over a provider→fetcher registry
  that is **empty today**, so it answers "no live school provider to poll yet".
- i18n: 25 Connect-school keys in all eight languages; help §School body.12 in
  all eight, section `updated` bumped.

## Why this shape
No portal is live (CLAUDE.md), so the screen captures a household's intent —
which portal, which channels, which child — ready for when an adapter ships, and
is honest that nothing is pulled in until then. The one thing that works today is
the forward path, which the screen leads with. Channel messages are untrusted and
go through HomeSend (confirm-before-write); a channel is read-only, never an
authorization channel.

## Verified
- Web production build ✓ (new page + route compile).
- Route smoke test on a dev server against the live project: `/household/
  integrations/school` → 307 to sign-in (protected), no 500, no runtime errors.
- `channel-sync.test.ts` 3/3; full school + homesend + i18n + help suites
  666/666; core + web typecheck clean; web lint clean; check:bundle clean;
  lint:help-links clean; secret lint clean.
- QA data: one QA auth user created on the live project and deleted; `.env.local`
  (from E2E vars) created for the smoke test and removed; dev server stopped;
  live `school_channels` and `school_channel` items both 0.

## Open / needs a person
- **Interactive 360px/desktop visual QA** of the populated screen (a signed-in
  admin household). Not done in this container — the onboarding setup was
  disproportionate; do it on the deployed site. This is what holds 08-029 /
  08-031 at In Progress rather than Done.
- **A live portal adapter** (credentials, the account holder's consent,
  integration tests) before any portal actually syncs or a channel is polled.
  Loop Learning and the rest stay "setup needed".

## Where the code lives
- `apps/web/app/household/integrations/school/page.tsx`
- `apps/web/app/_components/school-connect.tsx`,
  `apps/web/app/_lib/school-connect-labels.ts`
- `apps/web/app/(auth)/school-actions.ts` (connect/channel actions)
- `apps/web/app/household/integrations/page.tsx` (School card → screen),
  `apps/web/app/school/page.tsx` (Connect pills → screen)
- `apps/web/app/api/v1/households/[householdId]/integrations/school/channels/sync/route.ts`
- `packages/core/src/school/channel-sync.ts` (+ `channel-sync.test.ts`)
- i18n: `i18n/messages/areas/school/*`, `areas/help/*`, `help/guide.ts`
- Backlog: 08-029 In Progress, 08-031 In Progress
