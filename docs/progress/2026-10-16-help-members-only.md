# The user guide is for members only, and up to date with the app

**Date:** 2026-10-16

## Part 1: help behind sign-in

**What was public before:**
- `/help`: the guide, the FAQ and the search box, readable signed out by design.
- The guide's search, a server action callable by anyone with a POST.
- The guide's own words in client JavaScript. HomeTalk and HomeSend bundle the general English catalog, which contained the help area, and other languages loaded as lazy chunks. All of it is downloadable from `/_next/static` without signing in.
- Links from the landing header ("Help"), the landing contact section ("Read the guide"), the landing footer ("User guide") and `/legal`.

**What is protected now:**
- `/help` and `/help/*` are in `security/route-policy.ts`'s authenticated list. The page itself calls `requireSession("/help")`, the same check every other protected page uses. A signed-out visitor goes to `/sign-in?next=%2Fhelp` and comes back afterwards.
- `askTheGuide` checks for a verified user itself. A POST to `/help` without a session is redirected before it reaches the action.
- The guide's words moved out of the general catalogs into `help/words.ts`, which only the help page, its action and `help/guide.ts` / `help/search.ts` read.
- `scripts/check-client-bundle.mjs` (`npm run check:bundle`) runs after every CI build and nightly build. It fails if any guide sentence reaches a client chunk. It found the leak on the old build and finds nothing on the new one (137 phrases).
- `next.config.ts` sends `Cache-Control: private, no-store, max-age=0` and `X-Robots-Tag: noindex, nofollow` for `/help`, and the page's metadata says noindex.
- There is no sitemap, robots file or service worker.

**What stays public, and why:** the list lives in `route-policy.ts`.
- `/`, including `/#contact`: what WonderHome is, and how to reach a person.
- `/sign-in` and `/sign-up`: getting in.
- `/forgot-password`, `/reset-password` and `/auth/*`: recovering an account.
- `/legal`: terms and privacy, readable before agreeing.
- OAuth and webhooks: they authenticate their own callers.

**Links:**
- The landing header's "Help" became "Contact" (`#contact`).
- The contact card and the footer say the guide is for members and link to `/sign-in?next=%2Fhelp`. That is intended: they lead to sign-in and then the guide.
- `/legal` does the same.

## Part 2: the content

Built from code, not the old docs: navigation, Settings rows, the plan catalog read from the live `plan_features`, labels from the catalogs, and the privacy, step-up and autonomy code.

**Rewritten,** in all 8 languages:

| Section | Change | Code it matches |
|---|---|---|
| `language` | Help no longer follows the browser's language before sign-in | route policy |
| `accounts` | The account menu says "Log out", More says "Sign out" | `viewer-menu.tsx`, `more.signOut` |
| `home-send` | Adds the phone install banner | `install-banner.tsx` |
| `home-send` | Says an AI model reads the document | `classify-intake.ts` |
| `plan` | Pro also has health and fitness, voice and weather; Max adds acting without asking first and no monthly limits | live `plan_features` |
| `ai-autonomy` | The UI's level names, Suggest, Prepare, Ask approval and Execute, set in Manage Household → AI autonomy | `manage.mode.*` |
| `ai-autonomy` | "Payments, permission changes and deletions always need a person" | `manage.autonomy.note` |
| `what-wonderhome-is`, `talk-to-wonderhome`, `ai-key` | Say where an AI model is involved and what stays with the person | `model-client.ts`, `homebrain/validate.ts` |
| English only | "Manage household" → "Manage Household", the nav label | |

**Removed:** the signed-out frame's strings (`help.page.signedOut.*`, `help.page.homeLink`).

**Corrected on the public `/legal` page:**
- Export and deletion are built (`privacy/export.ts`, `fulfill-deletion.ts`).
- The assistant uses an AI provider.

**Checked and left as they were:**
- the reset link: works once, lasts an hour;
- the snooze options and "Learn when I usually act";
- HomeTalk's edit and search;
- "Failed safely" and "Recently handled";
- Today's views, "Plan something", Transactions;
- Activity and "Share the load";
- payment step-up;
- the 30-day deletion window;
- every Settings path;
- the developer key expiries.

**Maintenance:**
- **Last updated.** Each section carries an `updated` date: the last commit that changed its words, or today for the sections rewritten here. The date is shown in the reader's own date format.
- **Link check.** `scripts/lint-help-links.mjs` (`npm run lint:help-links`, in the CI lint job) fails on a link to a route or `/help#anchor` that does not exist, or an FAQ pointing at a missing section.
- **The rule.** CLAUDE.md, "Help content changes with the feature": a feature change updates the help in the same PR.

## Also in this change, as the owner asked

- The nightly E2E run is at 03:00 IST (cron `30 21 * * *`).
- **CLAUDE.md:**
  - every change reaches `main` through a PR that merges itself;
  - pre-launch, full test runs and E2E/QA test users on the live project are allowed without asking, with E2E against the live project only via `E2E_ALLOW_LIVE_PROJECT=1`;
  - that permission ends at launch.
- The nightly can run the signed-in specs once the `E2E_SUPABASE_*` secrets and the `E2E_ALLOW_LIVE_PROJECT` variable are set in GitHub. Until then they report themselves skipped.

## Verified

- typecheck, ESLint, and the migration, embed, help-link, boundary and secret lints all pass.
- The security suite and the eval pass.
- All 3,027 unit tests pass, and all 64 script tests (including the new link and bundle checks).
- A full Playwright run on a fresh production build gives 300 passed and 12 skipped (8 on purpose, 4 needing a project). `help.spec.ts` against the live project gives 22 of 22 passed, signed out and signed in, mobile and desktop.
- **By hand on the production build:**
  - `GET /help`: 307 to sign-in, a 21-byte body, `private, no-store` and noindex;
  - a server-action POST: 307, 21 bytes;
  - the landing HTML and 785 KB of its JS: no guide text and no `/help` link.
- **Screens.** At 360 px and 1280 px, the help page renders signed in with 24 "Last updated" labels and no horizontal scroll. The landing header shows Contact.
- `npm run brand -- --check` fails locally on `og.png` on a clean `main` too, from this machine's font rendering. CI passes it.

**Cleanup:** every E2E and screenshot account was created on `@e2e.wonderhome-test.internal` and deleted with its household. The SQL count afterwards was 0 users and 0 households.

## Still open

- **Nightly secrets.** The nightly's signed-in specs need the `E2E_SUPABASE_*` secrets and the `E2E_ALLOW_LIVE_PROJECT` variable in GitHub, which a person sets.
- **Other languages.** The seven non-English languages were updated by the same session that wrote the English. A native reader's pass would be worth having.
