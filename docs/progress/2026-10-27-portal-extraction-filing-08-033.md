# 2026-10-27 — Portal fetch: extraction + filing (08-033, slice 5)

Turns the deployed worker from "reads and reports" into "files for confirmation".
The worker was verified live first: a credential-less self-test job went
pending → failed ("no stored sign-in") in ~350 ms, proving it claims and runs
queue jobs with no portal login.

## Built (in core, so CI vitest covers it; the worker stays thin)
- **`page-extract.ts`** — `extractGenericItems`: with no portal-specific
  knowledge, file the whole rendered page as **one item per page per day**
  (dated, so twice-daily runs and "Fetch now" taps dedup) rather than guessing a
  split that would flood HomeSend with fragments. HomeSend's own understanding
  does the real extraction. Blank / login / too-short pages file nothing.
- **`homesend-filer.ts`** — `homeSendPortalFiler`: files each item through
  `ingestText` as the connection's member (the Admin who connected it), so it
  lands as a HomeSend item **awaiting confirmation**. `understand` wraps classify
  in try/catch and files a needs-review item when there's no AI key — so filing
  always degrades safely (always-confirm). `ingest` is injectable for tests.
- Wired into the worker's **`run-job.ts`**: the real extractor + filer replace
  the placeholders; `filingMember()` resolves who an item is filed as
  (`set_by_member_id`, else any household member). The worker's placeholder
  `extractor.ts`/`filer.ts` were removed.

## Verified
- Portals vitest **38** (page-extract: readable page → one dated item, blank →
  none, first-line fallback; filer: files each item as the actor, labels
  title/subject/date, skips empty). Core + worker typecheck clean; worker
  real-browser test still 2/2; `lint:boundaries`/`knowledge`/`secrets` clean. No
  migration in this slice.

## Behaviour now
With a scrape URL configured and a connected portal, a fetch signs in, reads the
page, and files one HomeSend item per page per day for the family to confirm. It
does nothing visible until scrape URLs exist (the Connect-school UI slice adds
that) — today they'd be added via the DB.

## Open / next slices
- **Connect-school UI**: scrape-URL list, reconnect state, and wire "Fetch now"
  to `enqueue_portal_fetch_job`.
- **pg_cron** twice-daily `enqueue_all_portal_fetch_jobs()`.
- **loop-learning provider adapter** — precise per-item split instead of
  one-item-per-page.
- **KMS/Vault hardening** of portal + credential secrets.

## Where the code lives
- `packages/core/src/portals/page-extract.ts`, `homesend-filer.ts` (+ tests)
- `apps/portal-worker/src/run-job.ts` (placeholders removed)
