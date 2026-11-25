# Nightly E2E: "the Sign in click didn't leave /sign-in" (2026-11-25)

The nightly at `78863a8` failed one run (45330312923, 24 Nov 05:00Z) and passed the next (05:26Z). Three tests failed and one passed only on retry, all at the same step: the page stayed on `/sign-in?next=…` after the Sign in click. #637's note had left this open.

## What the failed run shows

- **The click worked.** Every failure's page snapshot shows the button as "Signing in…" [disabled]: the form was hydrated and submitted. Not a click before hydration.
- **The server never answered.** In the traces the sign-in action's POST has no response when the 5 s `toHaveURL` gives up. A smaller action on the same page answered in 12 ms. Not a redirect race and not a missing cookie: there was no response at all.
- **No message was hidden.** The form showed no alert, and the server logged no warning. The `auth.attempt` throttle (30 per address per 10 minutes) would have shown a message.
- **All failures fell in one 90-second window** (05:04:25–05:05:40Z), retries included.

## What a local run against the live project showed

The three specs ×5 at 4 workers, against the live project (`E2E_ALLOW_LIVE_PROJECT=1`, production build), reproduced it. Timed steps of the sign-in action:

| step | alone | under the nightly's load (avg / max) |
|---|---|---|
| `auth.attempt` throttle | 0.3–0.8 s | 2.0 s / 15.6 s |
| password check | 0.4–0.5 s | 6.9 s / 38.6 s |
| claim members | 0.4–0.9 s | 10.7 s / 60.5 s |
| platform admins | 0.3–0.7 s | 11.4 s / 62.2 s |

There was also one statement timeout (`listMemberships failed: 57014`). The whole Supabase instance slows at once. **Auth's health endpoint, which never touches the database, took 9.5 s**. The app server's event loop stayed fast throughout (a static file answered in 2–50 ms).

**Production feels it too.** While these runs went, `https://home.wonderapps.biz/api/v1/health/ready` (Vercel `bom1`, next to the database) answered **503**. It recovered within 30 s of stopping the run.

No single step is the cause. Each heavy step alone kept the instance fast (readiness 0.4–1.6 s):

- a full download of a household (172 tables, 8 at a time, 7.6 s);
- `reset_household` (1.5 s; 4 at once, 3–5 s each);
- a cascading household delete (1–4 s);
- the other Admin's download;
- the owner's download and reset;
- screens.spec alone at 4 workers.

What overloads the instance is sustained parallel load. The snapshot reports `max_connections` 60, which suggests a small, burstable compute tier, but the Supabase connector refused every call this session (SQL, logs, project details), so the tier and CPU were not checked.

The stall then shows up at sign-in first because sign-in makes four calls in a row and then renders the next page, all inside a 5 s check.

## What changed

- **Sign-in makes fewer calls in a row** (`apps/web/app/(auth)/actions.ts`, `apps/web/app/auth/callback/route.ts`). Claiming members and the platform-admin check are independent, so they now run side by side. Every sign-in is one database round trip shorter.
- **Specs that only need to be signed in skip the form** (`e2e/sign-in.ts` `openSignedIn`). It makes one Supabase Auth call and sets the same `@supabase/ssr` cookies the app sets, kept per account for the worker. Used by screens, reset-home, platform-admin and both HomeTalk specs. These no longer count against `auth.attempt` either.
- **Specs whose subject is the form wait for its answer** (`signInThroughForm`). It waits for the sign-in action's response, then for either the next page or the form's message, and fails with that message. Used by help and sign-out. No timeout was raised.
- **Two workers against the live project** (`playwright.config.ts`; owner, 2026-11-25). This applies locally and in the nightly. The suite took about 8 minutes at 4 workers, inside the job's 90.

## Verified

- Typecheck (apps/web; the e2e files with `tsc --strict`) and ESLint on the changed app files: clean.
- The full download, reset, delete and each reset-home test alone, against the live project: pass, and production readiness stays 200.
- **Not stable yet:** the three specs ×5 at **2 workers** still drove production readiness to 503 after about 3 minutes. The watcher stopped the run, so the ×5 repeat was not completed.

## Open: needs the owner

Two workers is not enough to keep the nightly from slowing production. The lasting fixes are infrastructure decisions:

1. **A separate E2E Supabase project** (the end state CLAUDE.md already names for launch), or
2. **A larger compute size for `wonderhome`**, after checking Supabase → Reports → CPU for 24 Nov 05:00–05:10Z and 25 Nov 00:20–01:15Z (UTC). The checks below found no single heavy step, so this assumes the stalls come from CPU running out.

Separately, `claim_portal_fetch_job()` has 951,088 calls on record (about 1 ms each): `apps/portal-worker` polls the database constantly. It isn't what overloads the instance, but it is steady background load.

## Cleanup

E2E and probe accounts from this session: 3 accounts and 3 households were left by killed runs. They were deleted, and a recount found none on the E2E domain. The probes' own accounts deleted themselves. Nothing was uploaded to Storage. Local server, browsers and scratch files stopped and removed.
