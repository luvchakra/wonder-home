# Performance pass: compute beside the data, verify sessions locally

**Date:** 2026-09-17 · **Kind:** performance (story 19-007, in progress)

## What was done

Measured first. Two things dominated: the database was in Tokyo while
functions ran in Washington, and every request paid a network round trip to
the auth server (`getUser()`) in the middleware and again in the page.

- Functions pinned to the database's region in `vercel.json`.
- `verifyUser()` checks the ES256 session token locally against the JWKS
  (cached process-wide by auth-js): a live probe measured 2 ms against
  219 ms for `getUser()`, with a forged token rejected. `getUser()` remains
  only as a fallback for a symmetric-key project.
- `createClient`, `getVerifiedUser`, `listMemberships` and
  `loadSubscription` are memoised per request with React `cache`.
- Every link is `next/link`; `app/loading.tsx` answers the tap immediately;
  Home and Today stream their data under `<Suspense>`.
- The landing page's plan catalogue comes from `unstable_cache` (hourly).
- `optimizePackageImports` for lucide and Radix.

The rules are written up in `design/DESIGN-NOTES.md` under "Performance rules".

## Still open

- p95 measurement against the live deployment to close 19-007.
- The region pin moved to `bom1` with the database move on 2026-09-18.

## Where

`packages/core/src/db/server.ts`, `api/auth.ts`, `db/middleware.ts`,
`apps/web/app/loading.tsx`, `apps/web/app/_screens/*`, `vercel.json`,
`apps/web/next.config.ts`.
