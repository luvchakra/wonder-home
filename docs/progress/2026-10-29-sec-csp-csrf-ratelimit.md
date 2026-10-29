# SEC-05, SEC-09, SEC-06: strict CSP, CSRF origin check, rate-limit alerting and fairness

Date: 2026-10-29. Plan: `docs/plans/2026-10-29-fast-and-secure-at-scale.md`. Detail: `docs/security/csp.md`, `docs/security/rate-limits.md`.

## Done
- **SEC-05.** The middleware makes a per-request nonce; Next stamps it on its scripts. Strict policy: `script-src 'self' 'nonce-…' 'strict-dynamic'` (no `'unsafe-inline'`), plus `report-uri /api/v1/security/csp-report` (bounded, redacted, sampled log line). Styles keep `'unsafe-inline'` (style attributes can't take a nonce). Root layout awaits `connection()` so every page renders with a nonce (`/legal`, `/sign-in/phone`, `/household/school` no longer prerendered).
- **Rollout, `CSP_MODE`.** Default `report-only`: the old policy is still enforced (static header) and the strict one is reported. `CSP_MODE=enforce` (then redeploy) enforces the strict one. Why not enforce now: signed-in screens, the service worker and Gemini voice could not be driven in the build container.
- **Finding worth keeping.** Next copies every header a middleware sets onto the render request after its override step, so a nonce-free enforcing `Content-Security-Policy` set by the middleware hides the nonce. In report-only the middleware therefore sets only `-Report-Only`; the enforced old policy comes from `next.config.ts`.
- **SEC-09.** `security/csrf.ts`, run in the middleware: mutating method + cookie + no `Authorization` + Origin/Referer/Sec-Fetch-Site not ours → 403. Explicit, tested exemptions for webhooks, cron, signed links, OAuth/Alexa, partner API and the CSP report; the share target refuses only an explicit foreign Origin.
- **SEC-06.** Rejections log once per bucket per minute plus a summary (limiter, scope, 8-hex digest, never ids); counter failure logs at error level (`rate_limit_unavailable`); no DB row per refusal. New household buckets beside the member ones for HomeTalk turns, HomeSend intake and links (uploads, pastes, shares), WhatsApp intake and Gemini voice sessions (`hitRateLimitFair`). No existing limit changed.

## Verified
core and web typecheck; ESLint on web; `npx vitest run packages/core/src/security apps/web/middleware-matcher.test.ts packages/core/src/db` (223 pass); `npm run build -w apps/web`; `check:bundle`; `lint:boundaries`. Playwright sweep of the production build (placeholder Supabase): `/`, `/sign-in`, `/sign-up`, `/legal`, `/sign-in/phone`, plus `/family /groceries /ai /settings /about` (which land on sign-in) — in enforce mode 0 violations and the page hydrates; in report-only mode 0 violations. curl: foreign Origin + cookie → 403, same origin passes, CSP report → 204 and one redacted log line.

## Open / needs a person
- Not verified here (no signed-in test project): signed-in screens, the service worker, Gemini Live voice, WhatsApp, payments, the share target. Hence report-only. After deploy, watch for `csp violation` log lines for a week, then set `CSP_MODE=enforce`.
- Short-TTL fallback cap while the counter is down: not built (over-blocking risk); alert on `rate limit unavailable; allowing`.
- `middleware.ts` is still the deprecated name for Next's `proxy.ts`.

## Needed from you
- **After about a week in production, switch the strict CSP on.** Vercel dashboard → project `wonderhome` → Settings → Environment Variables → add `CSP_MODE` = `enforce` (Production) → Deployments → redeploy `main`. Before that, check Vercel logs for lines saying `csp violation`; if there are none from real pages, go ahead. To undo, delete the variable and redeploy.
- **Optional:** add a log alert in Vercel for the message `rate limit unavailable; allowing` (it means the limiter's database counter is down).
