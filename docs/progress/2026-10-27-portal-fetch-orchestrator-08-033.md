# 2026-10-27 — Portal fetch: the orchestrator (08-033, slice 3)

The brain the worker runs on a schedule and on demand. Builds on slice 1 (the
engine) and slice 2 (the data model); written in core behind ports so it is
fully testable here — the real browser, HomeBrain, HomeSend and Fly are the
injected edges.

## Built — `packages/core/src/portals/fetch-connection.ts`
`fetchConnection(deps)`:
1. `ensureSession` first — reuse a session or auto re-login; a real auth failure
   ends the run as `reconnect_needed`, nothing read or filed.
2. For each enabled page: `goto` → read rendered text → `extractor.extract` →
   drop items already in the cursor (and duplicates within the batch, via
   `itemHash`) → file only the fresh ones through `filer.file` → `recordSeen`.
   File-then-record, so a failed file is retried next run, never silently lost.
3. A page that throws is recorded in its `TargetOutcome.error` and skipped — it
   never fails the other pages or the whole run.
4. Read-only: navigates and reads, never submits/sends/pays.

Ports: `PortalExtractor` (real = HomeBrain, validated), `PortalFiler`
(real = HomeSend, always-confirm), `PortalCursorStore` (real =
`portalCursorStore()`, added to `cursor-repository.ts`, backed by
`portal_fetch_cursors`). The session store and credentials come from slice 2.

## Verified
- `fetch-connection.test.ts` **5/5**: reads each page and files fresh items;
  files nothing on a second run (cursor remembers); collapses duplicates within a
  page; ends `reconnect_needed` with nothing filed when the session can't be
  established; isolates a page that fails to load while the others still file.
- Portals vitest **32** total; core typecheck + `lint:boundaries`/`knowledge`/
  `secrets` clean. No DB/migration changes in this slice.

## Open / next slices
- **Playwright `PortalPage`/`PortalBrowser`** implementation + the **Fly `bom`
  worker + Supabase job queue** + the governed internal filing endpoint. (Owner
  sets up Fly as the last step; the worker code and `fly.toml`/`Dockerfile` are
  built first so the deploy is turnkey.)
- **HomeBrain extraction** wiring (the real `PortalExtractor`, validated).
- **HomeSend filing** wiring (the real `PortalFiler`, always-confirm; `school`/
  `portal_scrape` source).
- `loop-learning` provider adapter (precise login + task/channel/report reads).
- Connect-school UI: scrape-URL list + advanced hints + real Test/Fetch + reconnect.
- KMS/Vault hardening of all portal secrets.

## Where the code lives
- `packages/core/src/portals/fetch-connection.ts` (+ `.test.ts`)
- `packages/core/src/portals/cursor-repository.ts` (`portalCursorStore`)
