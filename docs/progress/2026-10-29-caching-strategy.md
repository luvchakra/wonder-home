# Caching strategy: fast where it is safe, never shared where it is personal

**Date:** 2026-10-29 · **Asked by:** the owner ("implement best industry practices for cache in the application, this is for improving page loading timings"; security comes first)

## The rule, in one line

No shared cache (Vercel's CDN, a proxy) ever stores a page or API answer. The browser keeps a screen for 30 seconds and drops all of them on any write. Platform data, the same for every household, is kept per server for a minute. Household data is never cached across requests. Code: `packages/core/src/security/cache-policy.ts`, `packages/core/src/lib/platform-cache.ts`, `apps/web/next.config.ts`, `apps/web/middleware.ts`.

## What was cached before (audit)

| Layer | Before this change |
|---|---|
| Pages (HTML and RSC) | Every page is dynamic; only `/robots.txt` is static (build table). Next's default header `private, no-cache, no-store, max-age=0, must-revalidate`. Every page also carries a per-request CSP nonce (SEC-05), so no page may ever be shared, the signed-out landing page included. |
| API route handlers | Most set `no-store` themselves. `/api/v1/openapi` sends `public, max-age=300` (or `private, no-store` when docs need a session). No catch-all: a handler that forgot would have sent no Cache-Control at all. |
| Other handlers | `/e/[token]/card` and its `opengraph-image`: `public, max-age=300, s-maxage=300` (an invitation's share card; the token is the credential). `/meals/recipe-card/[id]`: `private, max-age=300`. |
| `next.config` headers | `/help/*` and `/careers/status`: `private, no-store, max-age=0`. |
| Built assets `/_next/static/*` | `public, max-age=31536000, immutable` (hashed names; Next sets this and it cannot be changed). |
| `public/` files (icons, `og.png`, `/brand`, `/email`, manifest, `sw.js`) | `public, max-age=0, must-revalidate`: a conditional request for every icon on every load. |
| Fonts | `next/font` self-hosts Sora and Caveat under `/_next/static/media` (immutable), `display: swap`, preloaded. Already right. |
| Images | Plain `<img>` with `loading="lazy"` for remote pictures (Supabase signed URLs, catalog, TMDB). No `next/image`. |
| Compression | Brotli from Vercel (`content-encoding: br` measured). |
| Client router cache | `staleTimes.dynamic` 0 (Next 16 default): every move between areas was a full server render. Loading skeletons reused for 5 minutes. |
| Server, per request | React `cache()` on the hot reads (`loadSubscription`, home reads, `getSession`). |
| Server, across requests | Per-server TTL caches for holiday regions (`calendar/repository.ts`), the recipe catalogue (`meals/recipe-catalog.ts`, 10 min) and the careers job list. `plan_features` and running experiments were read on every gated screen. No `'use cache'`, no `unstable_cache`, no `cacheComponents`. |
| Service worker | `public/sw.js` shows push notifications only and caches nothing. |

## What changed

1. **Every response the middleware sees is `private, no-store, max-age=0`** with `Vary: Cookie` added (`responseCacheHeaders`). On `next start` the middleware's header wins over Next's page default; on Vercel, Next's own `no-store` default stays on pages (see Before and after). Either way so a route that one day turns static, or a handler that forgets, still cannot be stored by a CDN. Three handlers keep their own header, each listed in `HANDLER_CACHE_EXCEPTIONS` with the reason it is safe (openapi, the invitation card, the private recipe card). On pages Next sets `Vary` after the middleware, so pages carry Next's `Vary` without `Cookie`; with `no-store` nothing is stored to vary, so this costs nothing. Redirects and API answers carry `Vary: Cookie`.
2. **`public/` files are cached by name** (`publicFileCacheHeaders`): icons, `og.png`, `/brand/*`, `/email/*` for a day with a week of stale-while-revalidate (never `immutable`, since the names are not hashed); the manifest for an hour; `sw.js` `no-cache`, so a worker fix reaches everyone on their next visit.
3. **The browser keeps a visited screen for 30 seconds** (`experimental.staleTimes.dynamic: 30`). Moving back to an area seen in the last 30 seconds is instant, with no server render. Safety:
   - Next 16.4's client cache is per tab, in memory. `router.refresh()` and any Server Action that revalidates **or sets a cookie** bump its version and drop every kept screen (read in `next/dist/client/components/segment-cache/bfcache.js` and `server-action-reducer.js`).
   - Sign-out (`identity/session-actions.ts`) and household creation now also call `revalidatePath("/", "layout")`. Sign-in already clears the cookie-driven way.
   - Writes made with `fetch()` call `router.refresh()`: HomeTalk typed turns that executed an action, approvals and document receipts (`ai/assistant.tsx`); the live-voice engine choice; a plan change (`plan-form.tsx`); and every HomeTalk turn that navigates (`live-talk.tsx`, which Gemini Live also uses).
   - `apps/web/client-writes.test.ts` is the standing gate: every client file that POSTs, PUTs, PATCHes or DELETEs to the API must refresh, or be listed with the reason it changes nothing another screen shows.
4. **The plan catalogue is kept per server for 60 seconds** (`planCatalog` in `billing/repository.ts` via `lib/platform-cache.ts`). This covers every plan's features and the running experiments. The household's own subscription row is read on every request, as before.
   - `keptPerServer` takes only a key from the closed `PLATFORM_DATA` list. A key takes no id, so household data cannot be put there by mistake.
   - A failed or partial read is answered but never kept: no feature rows means a refused caller or an unseeded catalogue, and "experiments unreadable" falls back to the plan as sold.
   - `setFeaturePolicy` and `moveExperiment` clear it on their instance.

## Staleness windows (what a person can now see)

| Window | What | Where it ends |
|---|---|---|
| ≤ 30 s | A screen this tab showed in the last 30 s may open without changes **someone else** made since: another member, the reminder clock, a HomeSend item added on another device. The person's own writes always purge it. | Any write of their own, a pull-to-refresh/reload, or 30 s. Full page loads are never served from it. |
| ≤ 30 s | If someone loses access elsewhere (signed out on another device, removed from the household), this tab can reopen a screen it already showed them in the last 30 s. It holds nothing they had not already seen, and any server request is refused as before. | 30 s, or the next server request. |
| ≤ 60 s | A platform admin's change to a plan's burst or fair-use limits, or starting or stopping an entitlement experiment, reaches other server instances up to a minute late. The instance that made the change applies it at once. | 60 s TTL. |
| ≤ 1 day (+ 7 days in the background) | A changed app icon, share card or brand image. | Next request after a day; the old file is served while the new one is fetched. |
| ≤ 1 hour | A changed web manifest (name, colours, icons list). | 1 h. |

Nothing household-specific has a window on any shared cache: it is `no-store` everywhere.

## Verified

- **Unit gates** (new):
  - `apps/web/cache-headers.test.ts` walks all 168 page and route files under `app/`. It checks that every route the middleware sees gets `private, no-store`; that only the four cookie-free webhooks and cron calls skip the middleware; and that each exception's handler really sends the header its reason promises (a signed-in route only `private`).
  - `cache-policy.test.ts` covers the header helpers.
  - `platform-cache.test.ts` covers TTL, single-flight, never keeping a failure, forget, and refusing unknown keys. It also scans every migration and proves `plan_features` and `entitlement_experiments` read policies name no household, member, profile or user (`to authenticated`, row-level security on).
  - `billing/subscription-cache.test.ts` is the **leak test**: two households on different plans through the same server get their own plan each, with the catalogue read once and each subscription row read every time. A caller who sees no catalogue rows is answered and not kept.
  - `client-writes.test.ts` is described above.
- `packages/core` vitest: 393 files, 5405 tests pass. `apps/web` vitest: 16 files, 84 tests pass. Typecheck clean, ESLint clean on changed app files. `check:bundle` clean. `budget:bundle`: every route within budget (no change in shipped JS beyond `useRouter` in HomeTalk).
- **E2E** on the production build against the live project: `session`, `auth`, `shell`, `help` specs, 70 of 70 pass. These cover sign-in and out, forged cookies, the gate, security headers and installability.
- **Headers on the production build** (`next start`): the pages above `private, no-store, max-age=0`; icons `public, max-age=86400, stale-while-revalidate=604800`; manifest `public, max-age=3600, …`; `sw.js` `no-cache`; `/_next/static` immutable; openapi keeps `public, max-age=300`.
- **Write-then-navigate**, in a browser on the production build with a QA household:
  - Groceries → Home → another member adds an item → Groceries within seconds: the item is not shown (the 30 s window, working as designed); a reload shows it.
  - HomeTalk "add 2 packets of Saffron… to the grocery list" wrote the entry and took the person to Groceries. Both that item and the earlier one were on screen at once (981 ms): the write purged the kept screen.

## Before and after (production, `home.wonderapps.biz`)

Measured from a Claude Code cloud container in the US (every request crosses the Pacific: `x-vercel-id: iad1::bom1`), signed in as a fresh QA household, 360 px, Chromium, 5 full loads per route and 3 rounds of in-app navigation. Medians. The absolute numbers carry ~250 ms of trans-Pacific round trip a household in India does not pay; compare before with after, not with the 500 ms target.

| Route | TTFB before | Load before | TTFB after | Load after |
|---|---|---|---|---|
| Home `/` | 571 ms | 1158 ms | 558 / 564 ms | 2084 / 1621 ms |
| Today `/today` | 541 ms | 614 ms | 556 / 503 ms | 606 / 549 ms |
| Meals `/meals` | 542 ms | 760 ms | 543 / 520 ms | 741 / 727 ms |
| Groceries `/groceries` | 495 ms | 842 ms | 547 / 537 ms | 772 / 778 ms |

In-app navigation (link tap → screen painted, loading skeleton gone), before: Calendar 4567 / 1277 / 2344 ms, Family 2657 / 2655 / 8707 ms, Home 1162 / 817 / 811 ms over three rounds. After (two runs on production, 2026-10-29 15:30 UTC, deploy `dpl_DiGLUtgvNGiKjTdWsshbKB8R7T2C`): the first visit to an area is a server render as before (Calendar 1116 / 7003 ms, Family 3267 / 2383 ms). **Every return visit within 30 s took 56–99 ms** (Calendar 96, 79, 73, 77; Family 62, 56, 56, 59; Home 99, 97, 80, 80, 76, 77), against 811–8707 ms before.

"After" shows two runs (run 1 / run 2). Full loads always go to the server and are unchanged, as expected. Time to first byte is within ±30 ms of before on every route. Home's load event varied from 0.93 to 2.4 s both before and after (samples before: 1482, 2408, 1158, 996, 951; after: 5004 (a cold start), 2084, 2041, 2158, 964, 2441, 2007, 1621, 942, 929). The server part (TTFB) did not move, so the spread comes after the HTML arrives and is not caused by this change.

Headers on production after the deploy:
- Icons and `og.png`: `public, max-age=86400, stale-while-revalidate=604800`.
- Manifest: `public, max-age=3600, stale-while-revalidate=86400`.
- `sw.js`: `no-cache`.
- Before this change all of them answered `public, max-age=0, must-revalidate`.
- Pages on Vercel keep Next's own `private, no-cache, no-store, max-age=0, must-revalidate`; on `next start` the middleware's value won. Both are no-store, and the gate accepts either.
- `/api/v1/me` keeps the handler's `no-store` and gains `Vary: Cookie`. Redirects carry `private, no-store, max-age=0` and `Vary: Cookie`.
- Nothing personal is stored by Vercel's CDN: `x-vercel-cache: MISS` on every page.

## Not done, and why

- **`cacheComponents` / `'use cache'` / `cacheLife` / `cacheTag`.** These need Cache Components switched on for the whole app. That changes how every route renders: dynamic reads must sit under Suspense, and `export const dynamic` is not allowed (153 routes use it). It also gains little while every page carries a per-request nonce. It is an architecture change for its own story, not part of a caching pass. The per-server TTL pattern CLAUDE.md names covers platform data today. `unstable_cache` is deprecated in 16 and was not used.
- **`next/image` for household photos.** It would put signed Storage URLs (household photos) through Vercel's shared image cache, and the Hobby plan meters transformations. Remote pictures stay plain lazy `<img>`.
- **CDN caching of signed-out pages** (`s-maxage` on `/`, `/legal`, `/sign-in`). Each carries this request's CSP nonce, so a shared copy would hand every visitor the same nonce and undo SEC-05. They stay `no-store`.
- **A caching service worker. Proposal, not shipped.** The worker could cache only `/_next/static/*`, the `public/` images and an offline page (stale-while-revalidate), never a navigation or API request, versioned with old caches deleted on `activate`. The win is small: hashed assets are already immutable in the HTTP cache. The risk is real: a worker bug can pin an old app shell for every member. It is worth doing with an offline story, behind its own E2E.
- **Other platform reads** (grocery catalogue search, USDA/IFCT lookups) are keyed by what someone types, not read on every screen. They are left alone.

## Needed from you

Nothing. No Vercel setting is needed: Vercel honours these headers as they are, and nothing here needs a paid feature.

## Cleanup

Each measurement and check script created its own QA user and household and deleted both in `finally`. Each run printed "households left: 0, user deleted". Scratch scripts live outside the repository (session scratchpad). The local `next start` server was stopped.
