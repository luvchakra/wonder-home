# Guards against code that doesn't know live data; the nightly E2E made green

Date: 2026-10-26

## Why

The Responsibilities page broke in production: the two-mode autonomy code met rows still stored as "observe" (`docs/progress/2026-10-26-two-autonomy-modes.md`). The owner asked for proper tests so that nothing breaks like this again. Looking for them turned up two more problems:

- **The nightly E2E run had been red for two nights.**
- **Every signed-in spec is skipped every night:** the `E2E_SUPABASE_*` secrets are empty in GitHub, so no test ever loads a signed-in page against real data.

## What changed

- **Nightly fix:** `/api/v1/whatsapp/webhook` built `whatsappAsk(createAdminClient())` eagerly on every request (#320). Where the service role is unset (CI, the placeholder project) it threw "Invalid server configuration", and the route answered 500 instead of its documented 401. The admin client is now created only when a verified message is asked about. `domains.spec.ts` GET and POST pass on both profiles.
- **New `e2e/screens.spec.ts`:**
  - It signs in as a fresh household with responsibilities in both modes and one nobody owns, opens 25 main screens, and fails on "Something went wrong" or a 5xx.
  - It saves a group's mode through the real action and reads it back from the database.
  - It checks that an unowned group can't be set to Pre Approved.
  - It needs the `E2E_SUPABASE_*` secrets, like `help.spec.ts`.
- **`verify:live`** fails when a responsibility's autonomy is not one the code knows.
- **The group card** never crashes on a mode it has no words for (component test).
- **CLAUDE.md:** a migration that changes stored values must be safe in either order, and the screens that show those values are loaded right after it's applied.
- **Old-mode leftovers:** test fixtures and `scripts/itc/fam.json` use prepare and execute.
- **Responsibilities:** the Family tab is gone (the owner: "All" covers it). An old `?tab=family` link lands on All, and `manage.resp.tab.family` is removed in eight languages.

## Verified (locally, this container)

- **The full gate, `npm run verify`, stage by stage:**
  - typecheck, lint (0 errors), and every lint script;
  - tracker, security (12/12), and eval (172/172, 0 unsafe);
  - all unit tests (4,518 core, plus web);
  - `test:db` on a local Postgres 16, every migration fresh (0 failures);
  - build and `check:bundle`;
  - the full Playwright suite: 306 passed, 0 failed, 18 skipped (signed-in specs without keys).
- **The brand check** reports `og.png` out of date only in this container. The share card's text renders with different fonts here; CI passes it, and the asset was not regenerated.
- **Live:** no responsibility holds an unknown autonomy (0 of 61).

## Needs the owner

- To make the signed-in specs, the new screens spec included, run every night, add the repository secrets `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY` and `E2E_SUPABASE_SERVICE_ROLE_KEY`, and the variable `E2E_ALLOW_LIVE_PROJECT=1`. They go in GitHub → Settings → Secrets and variables → Actions. Pre-launch testing on the live project is already allowed (CLAUDE.md).
- For a session to sign in and drive pages itself, the same three values are needed in the cloud environment's settings.

## Cleanup

No QA accounts or rows were created; the local Postgres, servers and scratch files were stopped and removed.
