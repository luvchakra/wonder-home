# Autonomy: two modes instead of four

Date: 2026-10-26 · the owner's decision

## Why

The owner asked why four autonomy options exist when there are really two possibilities: WonderHome prepares and waits for review, or it acts without waiting. Reading the enforcement code confirmed it:

- **"approve" and "prepare" were identical:** `ai/tools.ts` treated `prepare_only` and `needs_approval` the same (allowed, needs approval).
- **"observe" barely differed:** it only refused to prepare anything.
  - An adult's own request in HomeTalk is consent, so the mode was never consulted there.
  - HomeSend asks first under observe exactly as under prepare.
  - Background agents are not switched on.
  - Its one live effect was refusing a child's or helper's request outright. Under prepare, that request goes to an adult instead.

The owner chose two: **prepare** ("WonderHome prepares, and waits for your OK") and **execute** ("WonderHome does it, and tells you afterwards").

## What changed

- **Migration `20261026090000_two_autonomy_modes`:**
  - `observe` and `approve` become `prepare`.
  - The default is `prepare`, and the check allows only `prepare` and `execute`.
  - `wh.autonomy_for` falls back to `prepare`.
  - Live data at the time: 30 observe, 1 approve, 5 prepare and 25 execute. The 31 observe and approve rows moved to prepare.
- **Engine (`household/autonomy.ts`):** `AUTONOMY_MODES = ["prepare", "execute"]`. `decideAutonomy` returns `needs_approval` or `execute`, and `observe_only` and `prepare_only` are gone.
  - A governed change under prepare is now a proposal you can confirm ("Shall I go ahead?"). Before, it was a dead-end "prepared" draft.
  - Paying, permission changes and deletes still always need a person. Irreversible actions need a person unless the mode is execute.
- **Fail closed:** `autonomy-lookup.ts`, HomeTalk's lookup and HomeSend's review read anything but a clean "execute" as "prepare", an old "observe" or "approve" included. There is still no path that defaults to execute.
- **Validation:** only execute needs an owner. An unowned outcome can be on prepare, and what it raises goes to the household's owner.
- **Sentences:** "just watch the bills" and "ask me before…" both set prepare (`configuration-intent.ts`).
- **UI:** the row editor, the group dropdown, the explainer and Manage Household's autonomy cards show two choices.
- **Words, eight languages:**
  - Prepare reuses each language's old "approve" wording ("Ask approval", "WonderHome asks first", "does the work the moment you say yes"), plus a new picker heading.
  - The observe and approve entries are removed.
  - Help: the autonomy section says "Two levels" and describes both.
- **Tests:** every test that pinned observe was rewritten to the new rule, not deleted.
  - Old values in a database fail closed to prepare (`autonomy-lookup.test.ts`, `run.test.ts`).
  - The retired modes are refused by the column (`test-playbook-rls.mjs`) and by the group action.

## Verified

- `npm run eval`: 172/172. Unsafe Action Rate is 0/20, and every blocking gate passes.
- Core: 4,516 tests (the whole suite after the fixes). Web: the touched suites pass. Both typechecks pass.
- `npm run test:db` on a local Postgres 16, with every migration applied fresh: 752 tests, 751 pass, 0 fail.
- `lint:migrations`, `lint:help-links`, the production build and `check:bundle` pass.
- Browser, Chromium at 360 px, with real English words from the catalog:
  - The group dropdown shows "WonderHome asks first" and opens two choices.
  - In an unowned group, "does it" is disabled with the reason.
  - The row editor offers the same two choices.
  - None of the retired words appear, and there is no overflow.

## Rollout

The live migration is applied after this PR's production deploy is READY:
- If it ran first, the old code could still write "observe" and be refused by the new check.
- If the new code runs first, it reads an old value as prepare, which is safe.

## Open

- Design documents under `design/` still describe four modes. They are historical and are not changed.
- The seven non-English picker headings are drafts for a native speaker.
