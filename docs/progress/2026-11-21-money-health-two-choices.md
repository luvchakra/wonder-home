# Money and health entries: two choices; AI Assistant cards fold (owner, 2026-11-21)

**Ask** (owner, from a phone screenshot of Settings → AI Assistant): "why there are 3 options, only auto approved and wait for review should be there".

## What changed
- **"Money and health entries"** (decision 2 of `docs/design/2026-11-14-nothing-stuck-in-review.md`) now has two choices:
  - **Auto approved (recommended)**, stored as `confirmed`, the default for a new home: a bill, receipt or health document is recorded straight away, confirmed when WonderHome is more sure than the Admin's bar. Otherwise it is marked Checking: below the bar, from a photo or file, a blank filled from history, or a doubtful hearing. Checking keeps its badge, its "check before paying" reminder and its one-tap confirm. Who a health document is for doesn't change. Paying never happens, and a Needs-you default still never confirms money or health.
  - **Wait for review** (`review`): unchanged.
- The old third choice, "Checking (recommended)" (`checking`, always Checking), is gone from the select.
- **Stored values, safe in either order.** `record-first.ts` `asMoneyHealthMode` reads a stored `checking` as `confirmed` (`LEGACY_MONEY_HEALTH_ALIASES`). No migration and no row rewrite: homes on Checking move to Auto approved as soon as this deploys, and homes on Wait for review or Confirmed keep their behaviour. An old "off" switch with no pick also reads as Auto approved now. `directAddFrom` no longer sets `DirectAdd.checking`, though the engine still honours it if passed.
- Words: the card's description and the option label in all eight languages. The help guide's `health.body.3` and `ai-key.body.4` changed in eight languages, with both sections' `updated` set to 2026-11-21.
- Docs: `docs/agent-platform.md`, the design note (decision 2 amended), backlog 14's decision line and the CLAUDE.md clause.
- Owner rule changed, not a gate lowered: eval cases HS-82 and HS-83 now expect a complete typed bill above the bar to be recorded confirmed (`auto_apply`) instead of `add_checking`. HS-106 drops the forced Checking flag. Unsafe Action Rate stays zero. The unit tests in `direct-add-repository.test.ts` and the options in `e2e/screens.spec.ts` follow the new choices.

## Settings → AI Assistant: collapsible cards with a chevron (owner, 2026-11-21)
Ask (owner, via the coordinator): "make these collapsible cards with chevron".
- Every setting card on the page is now the shared `CollapsibleSection` (`@wonderhome/core/ui/collapsible-section`), the same native `<details>`/`<summary>` fold the Profile page uses. The cards are: Ask before acting, How sure HomeSend must be (with each kind's bar inside), What Wait for Approval holds, Money and health entries, Who may file health records for others (now its own card right after Money and health), Email from new senders, Tidy up, the three Nothing-waits switches, What HomeSend has learned, the Gemini voice key, and What it may share.
- Folded, a card shows its tile, title and one line saying what is set (`settingsPage.ai.summary.*`, new in all eight languages: "Off: does it straight away", "More than 95%", "Auto approved", "Only actions", member names or "Nobody", "On"/"Off", "3 learned"). Open, it shows the full description and the one control. Each picker takes `folded`, which drops its own tile and keeps its title only for screen readers, so the select or switch keeps its name.
- Every card starts folded. `OpenOnHash` opens a linked card on arrival (`#money-health`, `#auto-add` and the settings-search links). `#share` and `#voice-key` moved from their sections onto the cards.
- Each save already calls `revalidatePath("/settings/ai")`, so the summary line updates once a choice is saved. An open card stays open because React doesn't reset `<details open>` when the prop hasn't changed.
- The "Which key answers" card (`#provider-key`) is left unfolded as the page's key line, untouched for PR #589 ("AI key in one place").
- Accessibility: `<summary>` is a native disclosure button with its own expanded state. It works with Enter and Space and shows the default focus ring, and its accessible name is the title plus the summary line. There is no `aria-controls`: the native element needs none, and the shared pattern doesn't use one.
- The specs in `e2e/screens.spec.ts` open a card the way a person does (`openCard`), and the bar test arrives by `#auto-add`. `settings-folded-card.test.tsx` covers the card starting folded, the summary content, a single title, tile and control, and exactly two choices.
- Verified: web typecheck, eslint, the new test, i18n and settings-search tests, `npm run build -w apps/web`, `check:bundle`. The card wasn't driven at 360 px or desktop: no `.env.local` here, so no QA home can be signed in. The nightly E2E runs the updated specs.

## Verified
- `npm run typecheck`, core lint, `npx vitest run` on household, homesend confirmation/auto-add, i18n, help and evaluation tests (498 passed), `npm run eval -- --cases HS-82,HS-83,HS-106` (3/3), `lint:help-links`, `tracker --check`.
- Not driven in a browser: this container has no `apps/web/.env.local`, so no QA home could be signed in. No QA data was created, so nothing needed cleaning up.

## For the owner
- How many homes change (run in the SQL Editor; read-only):
  ```sql
  select rule->>'value' as choice, count(*) from policies
  where category = 'ai_autonomy' and active and name = 'Money and health entries from HomeSend'
  group by 1;
  -- homes that never picked (they followed the old default, Checking, unless an old switch was on)
  select count(*) from households h where not exists (
    select 1 from policies p where p.household_id = h.id and p.category = 'ai_autonomy' and p.active
      and p.name = 'Money and health entries from HomeSend');
  ```
  Homes with `checking`, plus homes with no row at all (the old default), are now Auto approved.
