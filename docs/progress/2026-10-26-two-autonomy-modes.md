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

The owner chose two, and named them: **Wait for Approval** (stored as `prepare`) and **Pre Approved** (stored as `execute`). The same name is used in the picker, the group dropdown, the row badges, Manage Household and the help, in eight languages. The HomeSend review reason ("set to “Wait for Approval”") and HomeTalk's settings preview use it too.

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

## Rollout, and what went wrong

- **Plan:** apply the live migration after #351's production deploy was READY. Applying it first would let the old code write "observe" and be refused by the new check.
- **What happened:**
  - #351 first failed CI. The security suite caught a coverage count that went from 36 to 35.
  - It was fixed and merged, but the scheduled check that should have applied the migration had not fired yet.
  - For that gap, production ran the two-mode code against rows still stored as "observe". The Responsibilities page showed "Something went wrong": the group card looked up a label for "observe" and found none.
  - The owner reported it. The migration was then applied (`two_autonomy_modes`) and verified: 36 prepare and 25 execute, the check allows only (prepare, execute), the default is prepare, and `wh.autonomy_for` for an unknown outcome returns prepare.
- **The flaw in the plan:** "the new code reads an old value as prepare" held for the decision paths (the lookup, HomeTalk, HomeSend), but not for the screens, which read `ai_mode` straight from the table.
- **The fix:** `asAutonomyMode()` (`household/autonomy.ts`) reads any stored value as "execute" only when it says so, else "prepare". `listResponsibilities`, the Responsibilities, Househelper, Home and Manage Household screens all read through it now. `decideAutonomy` also acts only on an explicit "execute".
- **The lesson for future value changes:** the code that ships first must read both the old and the new values safely on every path, screens included. Or the migration ships first and writes only values the old code also accepts. CLAUDE.md now says a PR is done only once it has merged, deployed and had its live migration applied.

## Open

- Design documents under `design/` still describe four modes. They are historical and are not changed.
- The seven non-English picker headings are drafts for a native speaker.
