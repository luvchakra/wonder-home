# HomeSend Phase 3: a second, different-domain proposal per intake

**Date:** 2026-09-22
**Area:** HomeSend (`packages/core/src/homesend/`, `packages/core/src/ai/classify-intake.ts`, `apps/web/app/(auth)/home-send-actions.ts`, `apps/web/app/_components/home-send-*.tsx`)

## What was done

Phase 3 of the approved HomeSend architecture, scoped narrowly to the PRD's
own concrete example rather than a general cross-domain impact engine: one
intake can now confirm a *second*, different-domain write alongside its
primary classification — a school notice that is both a fee (a bill) and
implies a grocery need (a white T-shirt), a bill that implies a grocery
top-up, and so on. The architecture doc's "cross-domain impact analysis"
is real scope creep risk here — a fully generic `proposedChanges[]` array,
or a school-item secondary needing a child-selector, were both considered
and rejected in favour of the smallest shape that ships the PRD's actual
example: exactly one optional secondary, always a grocery suggestion,
never auto-applied.

1. **Classifier** (`ai/classify-intake.ts`) gained an optional
   `secondary: { reason, title } | null` on the extraction schema (both the
   Zod schema used by Anthropic/OpenAI and the parallel JSON schema used by
   Gemini), with a system-prompt paragraph telling the model this only
   applies to `bill`/`school_item` primaries, is always a grocery
   suggestion, and should be `null` far more often than not — a classifier
   that proposes a secondary on every turn is worse than one that never
   does. No `notes` field was added to the secondary shape: `createConsumable`'s
   input type has nowhere to put one, so nothing was built with nowhere to go.
2. **`homesend_changes_one_per_intake_domain`** (migration
   `20260922090000_homesend_secondary_domain.sql`) — narrows the existing
   one-row-per-intake uniqueness to one-row-per-intake-*per-domain*. An
   intake can now have a `bill` change and a `grocery_item` change, but
   never two of the same domain.
3. **Routing** (`home-send-actions.ts`'s `routeHomeSendItemAction`) — a new
   `includeSecondary`/`secondaryTitle` form pair, present only when the
   classifier proposed one and the household explicitly checks it, calls
   the same governed `createConsumable` every other grocery item goes
   through and records a second `homesend_changes` row for the
   `grocery_item` domain. Unconfirmed (checkbox left unchecked) writes
   nothing — the same never-write-without-review contract Phase 1
   established for the primary write.
4. **Undo, done right for two independent rows**: a new
   `hasActiveHomeSendChanges` (`homesend/changes.ts`) checks whether *any*
   non-undone change remains for an intake before flipping
   `home_send_items.status` to `undone`. Undoing only the secondary now
   correctly leaves the primary (and the item's `routed` status) intact;
   undoing the primary while a secondary remains does the same in reverse.
   Before this fix, the UI derived its badge from `item.status` directly —
   caught and corrected during design, before any test ran against it.
5. **UI**: the confirm form (`home-send-intake.tsx`) shows a checkbox +
   reason + an editable title field, appearing only for `bill`/`school_item`
   kinds with a proposed secondary. The inbox history
   (`home-send-inbox.tsx`) groups changes by intake and renders the
   secondary as an indented sub-row ("Also added to Groceries") with its
   own independent Undo/Undone control, deriving both the primary's status
   label and the secondary sub-row from `homesend_changes` rows directly
   rather than the coarser `item.status`.

## Verified

- Local: `npm run verify` clean end to end — typecheck, lint (including
  migrations/embeds/boundaries/secrets), tracker, brand, the P0 security
  suite (9/9 areas), the full unit suite, `test:db` (288 tests, including
  3 new ones added for the multi-domain constraint: a second
  different-domain write succeeds, a second same-domain write is still
  refused, and undoing only the secondary leaves the primary's
  `undone_at` null), `npm run build`, and the full Playwright `test:e2e`
  suite (264 tests, including `e2e/domains.spec.ts`'s anonymous-caller
  sweep unaffected by this change).
- Migration applied live via the Supabase MCP `apply_migration` tool
  against the `wonderhome` project (`kqxndableyysxqhxiorz`); confirmed
  with `npm run verify:live` (82/82 checks).
- Live browser verification against a throwaway QA household
  (`node scripts/qa-test-user.mjs create`, deleted afterward along with
  the household created via the app's own onboarding flow — cascade
  removed everything else): inserted a pre-classified intake with a
  proposed secondary directly via SQL (no platform AI key is configured
  in this environment, so the classifier itself could not be exercised
  live — the same honest gap Phase 1/2 already documented), then drove
  the actual confirm form at 390px: the secondary checkbox and reason
  rendered correctly, checking it revealed an editable title field
  prefilled from the proposal, and submitting created a real second
  `homesend_changes` row (`domain: grocery_item`) and a real `consumables`
  row (confirmed by direct SQL against the live project). The inbox then
  showed the primary row with its own Undo and an indented "Also added to
  Groceries" sub-row with its own Undo. Undoing only the secondary set its
  `undone_at` while leaving the primary's `undone_at` null and
  `home_send_items.status` at `routed` (not `undone`) — confirmed by
  direct SQL, and the UI correctly showed "Undo" on the primary row and
  "Undone" on the secondary sub-row after reload.

## Still open

- Phase 4 (System Share/PWA), Phase 5 (HomeSend UX — the address
  management screen for Phase 2's already-real backend), and Phase 6
  (hardening: malware scanning, AI eval golden cases, rate limiting,
  retention/observability) remain, per the architecture doc's own phase
  order.
- No platform AI provider key is configured in this environment, so the
  classifier's actual secondary-proposal behaviour (as opposed to the
  confirm/route/undo pipeline around it) has only been unit-tested against
  fixtures, not exercised against a real model call in this session — the
  same gap already flagged for Phase 1/2's classification path.

## Where the code lives

- `supabase/migrations/20260922090000_homesend_secondary_domain.sql`
- `packages/core/src/ai/classify-intake.ts`
- `packages/core/src/homesend/items.ts`, `changes.ts`
- `apps/web/app/(auth)/home-send-actions.ts`
- `apps/web/app/api/v1/homesend/email/webhook/route.ts`
- `apps/web/app/_components/home-send-intake.tsx`, `home-send-inbox.tsx`
- `scripts/test-homesend-rls.mjs` (3 new tests, 36 total)
