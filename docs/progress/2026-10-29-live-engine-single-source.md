# One source of truth for the live-conversation engine (2026-10-29)

## What and why

The owner reported (Settings → Voice): "This is wrong. I'm using Gemini Live,
not WonderHome for speaking." The Voice settings page showed **WonderHome**
while HomeTalk was actually running **Gemini Live**, and the two never
reconciled.

Root cause: the live-conversation engine was stored in **two places that
disagreed**.

1. The HomeTalk composer picked the engine with `useLiveEnginePreference`
   (`packages/core/src/components/ui/talk-composer.tsx`), persisted to the
   **browser's own `localStorage`** per household, client-side and per device.
2. Settings → Voice read and wrote the **household-wide default** on
   `household_voice_settings.live_engine` (default `wonderhome`), server-side
   and Admin-only.

With no `household_voice_settings` row the page showed the default
(WonderHome) while the composer's `localStorage` said Gemini Live — the
mismatch the owner saw. This is design-rule 23 ("every setting has one
editor") and rule 14 ("no two controls for one job") being broken: two
editors, two write paths, for one choice.

There was also a wording bug on the page: the engine dropdown's description
was tied to `geminiLive.available`, not to the **selected** option, so with a
healthy Gemini key the hint described Gemini Live even while "WonderHome" was
selected.

## The decision

Unify the engine onto **one per-member, server-persisted value** that both the
composer and the Voice settings page read and write, so they cannot drift and
the choice follows the member across devices.

- **Household default + per-member override.** `household_voice_settings.live_engine`
  stays as the household default/seed a member inherits before they choose.
  A new nullable column `household_members.live_engine` holds the member's own
  choice (null = follow the household default). Effective engine =
  `member override ?? household default`, then gated for Gemini availability.
- **Why per-member, not household-wide:** the composer picker is inherently a
  personal, in-context quick-switch; a member flipping it must not change the
  engine for everyone (the owner's explicit constraint). So the engine is a
  personal preference, self-editable; the household default remains the seed.
- **One write path (rule 23):** both surfaces write through one repository
  function, `saveMemberLiveEngine`. The composer writes via a new API route
  (`PUT /api/v1/households/:id/voice/live-engine`); Settings writes via the
  existing `saveVoice` action. The engine is **decoupled** from the household
  voice-settings row write (`toRow` no longer sets `live_engine`) so saving the
  household voice never moves the engine for everyone.
- **localStorage is now only a cache.** On load the server wins; the one
  exception is a one-time migration: a member who chose an engine in the
  browser before it was server-side (no explicit row yet) has that cached
  choice adopted and pushed up to the server, so the owner's existing Gemini
  Live choice is preserved and now shows in Settings too.
- **Wording fix:** the dropdown description now tracks the selected option
  (`liveEngineHint`), reusing existing label strings — no new user-facing
  copy, so no eight-language change was needed. The help guide already said
  "the composer shows which one is answering and lets you switch", which stays
  accurate.
- **"Right now" card** uses the member's effective engine, so it reads
  "You talk with WonderHome through Gemini Live" when Gemini is in effect
  rather than implying the browser's own voice.

The shared decision logic lives in one pure module,
`packages/core/src/voice/live-engine.ts` (`effectiveLiveEngine`,
`gateLiveEngine`, `resolveInitialEngine`, `liveEngineHint`), read by the
composer, the Voice settings form, the HomeTalk page and the Voice page.

## Where the code lives

- Migration: `supabase/migrations/20261029100000_member_live_engine.sql`
  (nullable column; no new RLS — inherits `household_members_update_self` /
  `household_members_update_admin`, and `wh.guard_member_self_update()` does
  not lock it; no index — read only by the member's own primary key).
- Core: `voice/live-engine.ts`; `voice/repository.ts`
  (`loadMemberLiveEngine`, `saveMemberLiveEngine`, `live_engine` dropped from
  `toRow`); `api/audit.ts` (`voice.live_engine_changed`).
- Composer: `components/ui/talk-composer.tsx` (`useLiveEnginePreference` now
  reconciles against the server + persists via `onEngineChange`).
- Web: `app/ai/page.tsx`, `app/ai/assistant.tsx` (persist via the new route),
  `app/_components/voice-forms.tsx`, `app/settings/voice/page.tsx`,
  `app/(auth)/voice-actions.ts`,
  `app/api/v1/households/[householdId]/voice/live-engine/route.ts`.

## Verified

- Typecheck (`@wonderhome/core` + `apps/web`), migration lint, import-boundary
  lint, `check:bundle`, and `next build` all pass.
- Unit tests: `packages/core/src/voice/live-engine.test.ts` (11) — effective
  engine, availability gate, the localStorage→server migration, server-wins
  reconciliation, and the hint-tracks-selection bug.
- RLS: `scripts/test-voice-links-rls.mjs` extended — a member sets their own
  `live_engine`, cannot set another's, an Admin may set anyone's, only a known
  engine, null allowed. (Runs in CI's `test:db`; there is no local Postgres
  server in the cloud container.)
- Migration applied to the live project `wonderhome`
  (`kqxndableyysxqhxiorz`); column confirmed present and nullable.
- **Real browser** (production build against the live project, voice flag on,
  a throwaway `max`-plan household with a Gemini voice key), at desktop and
  360 px — all checks passed:
  - Settings defaults to WonderHome with the **WonderHome** hint (not Gemini).
  - Switching to Gemini Live in the composer fires the PUT (200) and Settings
    then shows Gemini Live selected, the Gemini hint, and the "Right now" card
    reads "You talk with WonderHome through Gemini Live".
  - Switching back to WonderHome in Settings and saving is reflected in the
    composer.
  - No horizontal overflow at 360 px; the engine picker is visible.
  - The throwaway account and household were deleted afterwards (verified
    households=0, members=0; auth user deleted).

## Open / needs a person

- Nothing blocking. The owner's own household data was not touched; on their
  next load the deployed code migrates their existing `localStorage` Gemini
  Live choice up to the server once, so Settings and HomeTalk agree from then
  on.
