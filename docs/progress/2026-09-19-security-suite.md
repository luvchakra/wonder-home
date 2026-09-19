# The P0 security suite (story 15-008) — module 15 complete

**Date:** 2026-09-19
**Module:** 15 — Privacy, Security & Governance — **Done** (8/8)
**Status:** Done

## What the story asked for

Coverage of six named areas — horizontal privilege escalation, child and helper
boundaries, injection, SSRF, session abuse, prompt-injection tool misuse — with
a result "suitable for CI or operational automation" and "a deterministic
pass/fail signal".

A survey found three of those six had no coverage at all, and the sixth had no
single place to read the answer.

## What was built

**An SSRF guard, before the surface exists.** Nothing in the product makes an
outbound call today — every connector is a fixture. `security/outbound.ts` is
the guard the first real one will arrive behind: https only, no credentials in
the URL, a narrow port list, an explicit host allowlist, and every private range
refused, with the cloud metadata endpoints named individually because they are
the difference between a nuisance and a compromised deployment. Redirects go
through the same check, since a provider answering 302 to `169.254.169.254` has
asked us to fetch it on their behalf. It documents what it is *not*: a
DNS-rebinding defence, which no pre-flight check can be.

**A prompt-injection adversary.** `CLAUDE.md` claims an LLM response is never
authorization; `ai/prompt-injection.test.ts` is the attempt to falsify it. The
method matters — these tests do not check that a model refuses anything, because
a model's refusal is not a control. They assume the attacker **already won
upstream**: the intent is whatever they wanted, at full confidence, naming
whatever household they wanted. What is asserted is everything after that. A
payment still needs a person even at `execute` autonomy; a cross-household tool
call is refused before permission is even considered, so a head and a child get
byte-identical answers; and content claiming the household consented does not
create consent.

**Injection, on the three surfaces this codebase actually has.** There is no SQL
to inject into — and that is now asserted against the source rather than
assumed, by scanning every `.ts` file for query concatenation, template literals
passed to `.rpc()`, and interpolation into PostgREST filter syntax. The one real
surface I had introduced last story is the export's `Content-Disposition`
filename, built from a name the household chooses; it is tested against quotes,
CRLF header injection and path traversal.

**Session abuse**, as seven E2E cases that need no account: a forged cookie, a
malformed one that must not crash the gate, session fixation (an anonymous visit
must never be handed a cookie), a forged bearer token, tokens leaking into HTML,
`httpOnly`/`SameSite`, and sign-out not being reachable by GET.

**`npm run security`** — one command, one exit code, a line per area, `--json`
for a monitor.

## The part worth reading

The suite is a script rather than an alias for `vitest run` because a test
runner can only tell you the tests that exist passed. It cannot tell you an area
stopped being covered.

So each area declares its files and the exact case count at last review. The
first version used floors set comfortably below the real numbers — and when I
deleted the metadata-endpoint case to check the detector worked, **it passed**.
A floor with slack tolerates precisely the deletions it exists to catch.

It now records the exact count: fewer fails, more passes with a note to raise
the number. Deletions are always caught; adding a test is never blocked by
bookkeeping. Re-tested by deleting the same case — exit 1, naming the area.

## Where the code lives

| Piece | Path |
|---|---|
| SSRF guard | `packages/core/src/security/outbound.ts` |
| Prompt injection and tool misuse | `packages/core/src/ai/prompt-injection.test.ts` |
| Injection | `packages/core/src/security/injection.test.ts` |
| Session abuse | `e2e/session.spec.ts` |
| The suite | `scripts/security-suite.mjs` (`npm run security`) |

## What was verified

- `npm run security` — 9/9 areas, tests passed; **and** verified to exit 1 with
  one case removed
- `npm run typecheck`, `lint`, `lint:boundaries`, `lint:migrations` — clean
- `npm run lint:secrets` — passed, 450 files
- `npm run test` — 972 passing across 70 files
- `npm run build` — succeeded
- `npx playwright test` — 224 passing
- CI now runs `npm run security` as its own step

The secret lint caught both new test files for carrying credential-shaped
fixtures — the same trap as the audit fixtures earlier — and both now carry the
`lint-secrets: fixtures` directive saying why the strings are there.

## Module 15 is complete

All eight stories: threat model, tenant isolation, RBAC and privacy scopes,
encryption and secrets, AI privacy, audit, Privacy Centre, security testing.

Two themes ran through the last four, and both are worth carrying into other
modules. **A control nobody invokes is not a control** — eleven audit events
nothing emitted, a `step_up_verified_at` column nothing ever set. **A check
built after the surface is a check that was absent for a release** — which is
why the AI privacy gate and the SSRF guard both exist before the thing they
guard.

## Still open

- **`npm run security` does not run the E2E specs.** They need a server, so
  `npm run test:e2e` stays a separate CI step; the suite asserts those files
  still exist and still carry their cases, so deleting one is caught either way.
- **Uploads are untested because there are none.** `school_documents` records a
  `source: "uploaded"` but nothing accepts a file. Whoever builds uploads owes
  this suite an area: type sniffing, size limits, and never serving user content
  from the app's own origin.
- **Leaked-password protection is still off** on the Supabase project, and
  `CRON_SECRET` is still unset — both dashboard/env settings, both noted in the
  previous story's follow-ups and both still outstanding.
