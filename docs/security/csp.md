# Content-Security-Policy (SEC-05) and CSRF origin check (SEC-09)

Code: `packages/core/src/security/headers.ts` (policy), `apps/web/middleware.ts` (nonce, per request),
`packages/core/src/security/csp-report.ts` + `api/v1/security/csp-report` (violation log),
`packages/core/src/security/csrf.ts` (Origin check). Tests sit beside each.

## How it works
- The middleware makes a fresh nonce per request, puts the strict policy on the *request* (Next reads the nonce
  from it and stamps its own bootstrap and page scripts), and sets the policy header(s) on the response.
- Pages must render per request or they would ship without a nonce: the root layout awaits `connection()`.
  The cost is that `/legal`, `/sign-in/phone` and `/household/school` are no longer prerendered.
- Next 16 calls this file convention "proxy"; `middleware.ts` still works and is what the repo uses (rename is separate).

## Rollout: `CSP_MODE`
| `CSP_MODE` | Enforced | Report-only |
|---|---|---|
| unset / `report-only` (default) | previous policy (`script-src 'self' 'unsafe-inline'`) | strict policy |
| `enforce` | strict policy | — |

Both carry `report-uri /api/v1/security/csp-report`. Violations appear in the logs as `csp violation`
(directive, blocked origin, page path; never query strings, samples or cookies; at most 20 a minute per
server instance, then one `csp reports over budget` line). When a week of production logs shows none for real pages, set
`CSP_MODE=enforce` in Vercel and redeploy. Roll back by unsetting it. Signed-in screens could not be driven in
the build container (no test project), which is why the default is report-only.

## The strict policy
| Directive | Value | Why |
|---|---|---|
| `default-src` | `'self'` | everything else is opt-in |
| `script-src` | `'self' 'nonce-…' 'strict-dynamic'` | no `'unsafe-inline'`. `'strict-dynamic'` lets nonced scripts load the chunks they need; browsers then ignore `'self'`, kept only as a fallback. Dev adds `'unsafe-eval'` (React Refresh) |
| `style-src` | `'self' 'unsafe-inline'` | React `style={}` attributes, Radix positioning and Tailwind runtime values cannot carry a nonce. Injected CSS can restyle, not run code. Revisit if inline style attributes go away |
| `img-src` | `'self' blob: data:` + Supabase origin + `image.tmdb.org` | signed photo URLs, film posters |
| `connect-src` | `'self'` + Supabase origin + `wss://generativelanguage.googleapis.com` | API, realtime/storage, Gemini Live voice socket |
| `font-src` | `'self' data:` | `next/font` self-hosts Sora and Caveat |
| `media-src`, `manifest-src` | `'self'` | |
| `worker-src` | `'self' blob:` | service worker, audio worklets |
| `frame-src`, `frame-ancestors`, `object-src` | `'none'` | no embedding either way |
| `base-uri`, `form-action` | `'self'` | |
| `upgrade-insecure-requests` | production only | |
| `report-uri` | `/api/v1/security/csp-report` | free, in-app, redacted |

No analytics or third-party script SDK is loaded, so no third-party script source is allowed.

## CSRF (SEC-09)
Middleware refuses (403, logged as `cross-site request refused`) a POST/PUT/PATCH/DELETE that carries a cookie and
no `Authorization` header when `Origin` (else `Referer`, else `Sec-Fetch-Site`) is not our host. Our host is the
request `Host`, `NEXT_PUBLIC_SITE_URL`, and the Vercel deployment URLs. Requests naming none of the three are not
from a browser and pass. Server Actions keep Next's own check.

Exempt, in `CSRF_EXEMPT_PREFIXES` and tested: WhatsApp, billing and email webhooks (signature), `/api/v1/platform/*`,
`notifications/dispatch` and `calendar/subscriptions/sync` (Bearer `CRON_SECRET`), `notifications/email-off` (signed
link), `oauth/*` and `voice/alexa` (client credentials / linked-account token), `partner/*` (API key), and the CSP report.
`/api/v1/intake/share` (PWA share target) only refuses an explicit foreign Origin, since share-sheet posts vary by browser.
