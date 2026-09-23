# HomeSend 2.0, part 3: how it confirms, what it measures, and the acceptance matrix — Wave 3 (story 14-011, Done)

**Status:** story 14-011 is **Done**. Parts 1 (one pipeline) and 2
(resolution, reconciliation, email 2.0) shipped as PRs #112 and #113; this is
the last third of `design/HOMESEND-2.0-WAVE-3.md`.

## What was done, and why

- **Confirmation strategy (§12)**: `packages/core/src/homesend/confirmation.ts`,
  a pure `decideConfirmation()` that returns one of four modes, each with a
  reason in words:
  - *auto_apply*: only for a new grocery item or school item that was read with
    high confidence, sent in by a member, matches nothing on record, has no
    open question, no injected instructions and no extra needs, **and** only
    when the household's own autonomy setting for that outcome
    (`groceries.stocked` / `school.homework_done`, read from its
    responsibilities) is "execute". It runs through `decideAutonomy`, the
    same rule the agents use.
  - *govern*: a bill (money) or a health document (private). These always wait
    for a person, whatever the confidence or the setting.
  - *prepare*: medium confidence, a match on record, several needs, an email
    (nobody in the household was acting), or any other setting than "execute".
  - *ask*: low confidence, not knowing what it is, or not knowing who it is
    for. It asks one targeted question.

  The send actions apply an `auto_apply` through the same `createNew` path a
  person's confirm uses, record it as a change with the same Undo, and mark it
  `auto_added`. The page then says "Milk — added to Groceries on its own…"
  with an Undo button, and the inbox shows "· Added on its own". Items already
  waiting are never auto-applied when a page loads; only a fresh send can be.
- **Review outcomes (§19's raw material)**: migration
  `20260924110000_homesend_review_outcomes.sql` adds these columns to
  `home_send_items`:
  - `review_decision`: added / updated / cancelled / kept_existing / dismissed / auto_added
  - `review_proposal`: duplicate / update / cancellation / conflict
  - `review_subject`: resolved / asked / not_needed
  - `review_corrected` and `reviewed_at`

  All of them are closed words or a boolean, so nothing a household sent is
  repeated there. Routing, "Keep existing" and "Not worth adding" each record
  one. `review_corrected` is computed on the server by comparing what the
  person confirmed with what was read.
- **Metrics (§19)**: `homesend/metrics.ts`. `summarizeHomeSend()` is pure and
  `loadHomeSendMetrics()` reads the data. Each metric is a count out of a
  count (rule 9):
  - intake by source
  - parsing success, over what was actually read
  - entity resolution and ambiguity, over reviews where who it was for mattered
  - duplicate detection
  - proposal acceptance
  - correction, over items a person confirmed
  - downstream write success (changes still standing)
  - safe rejection
  - queue depth
  - median and p90 minutes from arrival to routed

  Platform-wide at `GET /api/v1/platform-admin/homesend-metrics?days=30`,
  gated on `ai_operations.read`, and documented in OpenAPI.
- **Acceptance matrix (§20)**: `homesend/acceptance-matrix.test.ts` has one
  test per row of the spec's matrix, 42 in all: Text 6, Files 7, Audio 5,
  Links 7, Email 10, Reconciliation 7. Each drives the real pipeline. The only
  stand-ins are for what is outside the repo: the model, the speech service,
  the web (reached only through the real SSRF-safe `fetchLinkSafely`) and the
  database. To make the email rows testable, the webhook's recipient
  resolution moved into core as `resolveRecipientHouseholds()`, and the test
  stand-in client gained `upsert`.
- **Fixes found on the way:**
  - Duplicate and conflict messages said "A child has event: Science
    Exhibition…" (the generic Wave 1 sentence, read without the household's
    people). They now use the named form: "I found Asmi's existing Science
    Exhibition for 28 Sep. This looks like the same one — keep the existing
    one, or add this as new?"
  - A bill no longer reads as "Kunal's electricity bill". A possessive is kept
    for school items and health documents, whose person is whose they are.
  - "Keep existing" reads back as "Kept existing", not "Dismissed".

## Found, not fixed here: `rpc("autonomy_for")` never reaches the database

`ai/run.ts`'s `lookupAutonomy` calls `supabase.rpc("autonomy_for")`, but the
function lives only in the `wh` schema. PostgREST answers
`404 PGRST202 — Could not find the function public.autonomy_for`. Verified live
against the project with the anon key.

The agents' executor therefore always falls back to "observe". That is safe,
but a household's "execute" setting has never taken effect for agent runs.
`record_usage` and `busy_windows` are called the same way and are probably
equally unreachable.

HomeSend does not use that path: it reads `responsibilities.ai_mode` through
`listResponsibilities`, under RLS. Fixing `run.ts`, either by adding `public`
wrappers or by reading the table the way HomeSend does, would **switch on
autonomous agent execution for real households** that have set "execute".
That is a product decision, so it is flagged here rather than bundled into
this story.

## Verification

- `npm run test`: 2,002 unit tests and 43 script tests, all green. That
  includes confirmation (11), metrics (7) and the §20 matrix (42).
- `node --test scripts/test-homesend-rls.mjs`: 60/60. The new tests cover:
  - a member records a review outcome
  - only closed words are accepted
  - a decision always comes with `reviewed_at`
  - another household cannot see the outcomes
- Typecheck and every lint are clean. The OpenAPI test covers the new path.
- **Migration applied live** through Supabase MCP `apply_migration`.
  `npm run verify:live` passes 130/130, with the five new columns in
  `SHIPPED_COLUMNS`. The metrics `select` was run against live PostgREST.
- **Browser, 360px and 1280px, no horizontal overflow.** Seeded readings stood
  in for a model, because the sandbox has no AI key:
  - a bill shows the "always waits for a person" line
  - a low-confidence item opens with "Is this something to buy: “Rice”?"
  - "Keep existing" on a duplicate records `kept_existing` / `duplicate` /
    `resolved`
  - adding Milk under a corrected name records `added` / `not_needed` /
    `corrected = true`
  - "Not worth adding" records `dismissed`
  - the history labels read "Kept existing" and "· Added on its own"
- **Not browser-driven:** a live auto-apply. It needs a real model reading on
  a fresh send, which needs an AI key. The decision is unit-tested row by row,
  and the write it makes is the same `createNew` path the browser drove
  through a person's Add.

## Test data

QA account `39742f57-1c57-4392-883e-fe750e45f3b2` and household "Mehta QA3
Home" `bdacc8c8-9163-47b7-bc8c-865b4de14282`. The cleanup after the merge is
recorded in the PR and in this session's report.

Two QA accounts were created by mistake while setting up
(`aec4cfd2-2054-49bf-b13e-872f12b027e7` and
`ed4adcf9-ddfa-494b-9e12-f12cfc1e30c2`) and were deleted straight away with
`qa-test-user.mjs delete`.

An older QA account, `42dc16e3-8e5b-463f-8f6a-965f69261bb6`, predates this
work and has not been proven to belong to this session, so it was left in
place. It can be removed with
`node scripts/qa-test-user.mjs delete 42dc16e3-8e5b-463f-8f6a-965f69261bb6`.

## Still open (needs a person)

- **Live email (§18):** a Resend account, a verified receiving domain, DNS,
  `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET`. Until someone sets these up it
  is not labelled connected.
- **The `autonomy_for` finding above:** a decision on whether agent runs
  should honour "execute".
- **A real model reading** (an AI key) to see auto-apply fire end to end.

## Where the code lives

- `packages/core/src/homesend/{confirmation,metrics,acceptance-matrix.test,addresses,reconcile,repository,items,testing}.ts`
- `apps/web/app/(auth)/{home-send-actions,home-send-review}.ts`
- `apps/web/app/_components/{home-send-intake,home-send-inbox,home-send-sheet}.tsx`
- `apps/web/app/api/v1/platform-admin/homesend-metrics/route.ts`
- `supabase/migrations/20260924110000_homesend_review_outcomes.sql`
- `scripts/test-homesend-rls.mjs`
