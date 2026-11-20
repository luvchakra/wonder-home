# Money and health entries: two choices (owner, 2026-11-21)

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
