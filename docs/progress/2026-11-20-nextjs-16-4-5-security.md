# Next.js 16.4.3 → 16.4.5: security patch (2026-11-20)

**Why.** `next build` warned that 16.4.3 "is affected by a known security
vulnerability". The owner said "upgrade" (2026-11-20).

**Advisories.** 16.4.5 (released 2026-11-03) is the security release that
fixes seven moderate advisories affecting `>=16.x <=16.4.4`:
GHSA-mfr8-8qww-v76h, GHSA-vc7v-qv4w-wrv8, GHSA-vvgp-ww4w-46vf,
GHSA-rhh4-g77r-r9qj (`use cache` disclosure/poisoning),
GHSA-pc58-hwjq-p385 (cross-client response injection, self-hosted),
GHSA-7qx7-33qx-rqx2 (SVG rejection bypass in image optimisation),
GHSA-f3mh-rxg3-f5g2 (HttpOnly cookie exposure on Edge routes).

**What changed.** `next` and `eslint-config-next` 16.4.3 → 16.4.5 (the
smallest jump that clears them; 16.4.6 is a backport with no security fixes).
The `@next/*` SWC binaries follow in the lockfile. React stays at 19.3.1, the
latest 19.x (no React advisory). Major 16 kept, per the fixed stack.
Dependabot majors #477–#479 left out. Lockfile written with npm 11 so the
`libc` fields on optional binaries stay.

**Verified.** Typecheck clean; lint 0 errors (5 existing warnings);
`npm run build -w apps/web` passes with no vulnerability warning;
`check:bundle` and `budget:bundle` pass; `cache-headers` + `client-writes`
gates 7/7; Playwright auth, shell and screens specs 58/58 (mobile and desktop).
`npm audit` no longer lists `next` (a dev-only `minimatch` advisory under
typescript-eslint remains, unrelated).

**Local note.** In a cloud container whose pre-installed Chromium differs from
the pinned Playwright build, run E2E with
`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
