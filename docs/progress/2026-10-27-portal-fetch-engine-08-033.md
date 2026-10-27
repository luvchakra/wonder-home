# 2026-10-27 — Generic portal fetch: design + engine core (08-033, slice 1)

The owner asked to turn the connected school portal (08-032) into an automatic
fetch, then widened it: make it work for **any** portal given
`url + username + password + post-auth scrape URL(s)`, and offer it to other
families (each for their own household).

## Design (owner decisions, 2026-10-27)
- **Read the rendered app, not the API.** Loop Learning encrypts both request and
  response bodies (CryptoJS AES with a static key for requests; responses carry an
  `encryptedSymmetricKey` unwrapped by an **RSA private key shipped in its public
  bundle**). Rather than hold and replay a portal's keys, drive the real app
  headlessly and read the decrypted DOM.
- **Generic by config, precise by provider.** A household supplies URL + creds +
  scrape URL(s) (+ optional selector hints); a `GenericAdapter` handles ordinary
  logins and HomeBrain extracts content. Known portals (Loop Learning) register an
  adapter. 
- **Self-healing session, unattended.** Loop Learning has **no OTP** (owner-confirmed),
  so: reuse a persisted session; on expiry auto re-login with the stored password;
  `reconnect_needed` only on a real failure (bad password / verification asked /
  repeated errors) — never an unbounded retry loop.
- **Multi-tenant** from day one.
- **Host locked: Fly.io `bom` worker** (next to Supabase ap-south-1) **+ a Supabase
  job queue** (`pgmq`/jobs table; Vercel enqueues "Fetch now", `pg_cron` the
  twice-daily runs). Static egress IP for per-portal rate limiting. No extra vendor;
  core written runner-agnostic (`fetchConnection(connectionId)`).
- **Security:** read-only (never submit/pay); SSRF-guarded scrape URLs (public https,
  same registrable domain as the portal); credentials hardened to KMS/Vault at rest
  as the footprint grows; AI-extracted web items always wait for confirmation.
- Email-forwarding into HomeSend stays the no-credential fallback; an official-access
  email to Loop Learning/Podar is worth sending in parallel.

Full plan was delivered to the owner (phone) as a document.

## Built (this PR — slice 1: engine core behind ports)
Infra-independent, fully testable here — no real browser, no DB, no live creds
("ports and deterministic mocks first"). `packages/core/src/portals/`:
- **`url-guard.ts`** — `validatePortalUrl` / `validateScrapeUrl` / `sameSite` /
  `baseDomain`: public https only, no IP-literals/localhost/metadata/internal, and a
  scrape URL must be the same registrable domain as its portal. (The network layer
  must still re-check the resolved IP at fetch time — DNS isn't visible here.)
- **`adapter.ts`** — the `PortalPage` / `PortalBrowser` ports, `PortalAdapter`
  contract, `LoginHints`, `SessionState`, `LoginResult`.
- **`registry.ts`** — `resolveAdapter`: pinned providerId → first matcher → generic.
- **`generic-adapter.ts`** — `GenericAdapter`: heuristic form login (finds password +
  nearest username + submit), reads signed-in / invalid / verification back from the
  page; conservative — reports `transient` rather than a false `authenticated`.
- **`ensure-session.ts`** — `ensureSession`: the self-healing state machine (reuse →
  auto re-login → bounded retries with backoff → `reconnect_needed`), with injectable
  `SessionStore`, credentials reader, and `onState`.
- **`dedupe.ts`** — `itemHash` / `selectNew`: idempotent per-connection cursor hashing
  so twice-daily runs never refile the same item.

## Verified
- `packages/core/src/portals` tests **24/24**: session reuse, auto re-login, bad
  password (no retry, nothing saved), verification surfaced (never bypassed),
  transient-retry-then-success, exhaustion → `reconnect_needed`; SSRF + same-site
  rejection; registry resolution; dedupe order/collapse.
- Core typecheck clean; `lint:boundaries` (1616 files), `lint:knowledge`,
  `lint:secrets` (2380 files) clean. No DB/migration/audit changes in this slice.

## Open / next slices
1. Playwright implementation of `PortalPage`/`PortalBrowser` (+ a mock-portal
   integration test; keep it out of the PR unit run / in nightly).
2. Encrypted session store + scrape-URL list + fetch-cursor migrations (KMS/Vault);
   register tables in the knowledge registry; new audit events through the catalogue
   **and** `describeAuditEvent` (the gate that bit 08-032).
3. Fly `bom` worker + Supabase queue + per-household context isolation + per-portal
   rate limiting; the governed internal filing endpoint.
4. HomeBrain extraction wiring (validated; always-confirm default via HomeSend).
5. `loop-learning` provider adapter (precise login + task/channel/report reads).
6. Connect-school UI: scrape-URL list, advanced hints, real Test/Fetch, reconnect state.

## Where the code lives
- `packages/core/src/portals/*` (+ `*.test.ts`).
- Backlog: `backlogs/08-Kids-and-School-Intelligence.md` 08-033 → In Progress.
