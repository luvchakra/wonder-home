# Wave 5, part 3: production hardening (story 14-013 Done)

**Spec:** `design/AI-EVALUATION-WAVE-5.md` §14–§17, §21, §25.

With part 3, story 14-013's Definition of Done is met:
- the evaluation framework (part 1);
- corrections as evidence and approvals bound to the exact proposal (part 2);
- limits, timeouts, email observability, retries, failure semantics and
  concurrency guards (this part);
- security cases for all of it, in `npm run security`.

## What was done

- **§15 Rate limits.**
  - Migration `20260924150000` adds `rate_limit_counters`. Its only way in
    is `public.rate_limit_hit(bucket, subject, window, max)`, which is
    granted to `service_role` alone and has deny-all RLS.
  - Buckets (`security/rate-limit.ts`):

    | Bucket | Limit | Keyed by |
    |---|---|---|
    | `hometalk.turn` | 30 a minute | member |
    | `ai.model` | 150 an hour | household |
    | `homesend.intake` | 30 per 10 minutes | member |
    | `homesend.link` | 15 per 10 minutes | member |
    | `homesend.email` | 60 an hour | household |

  - Where each limit applies:
    - **HomeTalk turn.** Over the limit, the turn is refused with
      `rate_limited`.
    - **Model calls.** Over the limit, the model is not called. The turn
      falls back to the rules with a `not_transmitted_rate_limited`
      disclosure.
    - **HomeSend.** Upload, paste and share are limited, and links have a
      tighter limit of their own.
    - **Forwarded email.** Over the limit, the email is still kept, but it
      is not read by a model and its attachments are not processed.
  - The limiter fails open: an unreachable counter lets the request through.
    It throttles abuse and is not an authorization gate.
  - The wording says the pause is temporary and nothing was lost.
- **§15 Payload limits.**
  - PDFs: 40 pages at most, counted from page objects.
  - Audio: 10 minutes at most. This is exact for WAV, read from the header.
    Compressed audio stays bounded by bytes, because its length cannot be
    read cheaply.
  - The email webhook body is capped at 256 KB (413 above that).
  - An over-limit file fails safely as `too_large` and is kept under
    "Failed safely".
- **§15 Timeouts.**
  - `ai/provider-clients.ts` is now the one place model clients are made:
    understanding 12 s, answer composition 15 s, classification and vision
    30 s, each with one SDK retry.
  - Google voice calls abort after 20 s.
- **§14 Email forwarding observed end to end.**
  - Every webhook exit records closed-word events in
    `homesend_email_events`: delivered, signature failed, unrouted,
    duplicate, fetch failed, attachment failed or too large, classification
    failed, retry queued, rate limited, and processed with its latency.
  - `GET /api/v1/platform-admin/homesend-metrics` now also returns `email`,
    covering the last 24 hours:
    - counts by kind;
    - median and p90 latency;
    - the forwarded review queue;
    - routed and rejected shares;
    - any firing §14 alert.
  - Alerts (`homesend/email-monitoring.ts`) count only the last hour:
    - 3 provider fetch failures;
    - 50 forwarded items waiting on a person;
    - duplicates at 50% or more of at least 10 deliveries;
    - 5 attachment failures.

    A firing alert is also logged at error level.
- **§16 Retries through the queue.**
  - A forwarded email whose classification failed is kept and queued as a
    `homesend.classify` job: one waiting job per item, five minutes out,
    dead after five tries.
  - The queue is drained after the response through Next's `after()`, and
    by the daily retention run.
  - The drain skips an item someone already acted on. An unknown job kind
    backs off to dead rather than vanishing.
  - `public.claim_jobs` and `public.complete_job` are service-role wrappers.
- **Cron fix.** `/platform/retention` and `/platform/webhook-delivery` were
  POST-only, while Vercel Cron sends GET, so neither had ever run on
  schedule. Both now export `GET`.
  - Retention also drains jobs, clears day-old rate-limit counters and
    removes email events older than 90 days.
- **§16 Honest failure semantics.**
  - After a multi-part request with mixed results, HomeTalk adds one plain
    line: `Done: "…". Waiting for your OK: "…". Not done: "…".` It comes from
    `partialSummary` in `conversation/decompose.ts`.
  - When the household read fails, HomeTalk says so instead of answering
    from an empty picture.
- **§17 Concurrency.**
  - An idempotency key is reserved while its request is in flight (status
    102, a two-minute expiry). A double tap gets "still being handled", and
    a failure releases the key.
  - One household runs one agent pass at a time (10-minute lock).
- **§21 Security, continuously tested.** `npm run security` gained three
  areas:
  - untrusted intake (79);
  - AI release safety (33);
  - abuse and retries (27).

## Verified

- `typecheck`, `lint`, and the migration, embed, boundary and secret lints
  all pass.
- `npm run test`: 145 files, 2219 tests. The new
  `homesend/hardening.test.ts` has 12. Idempotency gained 2, and the
  agent-run lock has its own test.
- `npm run test:db`: 431/431. The new `scripts/test-hardening-rls.mjs`
  checks that:
  - the limiter counts atomically per subject and bucket;
  - no session can call, read, plant or reset a counter;
  - email events accept closed words only and are unreadable to members;
  - only the server reaches the job wrappers;
  - retries dedupe per item;
  - idempotency reservations stay within their own household.
- `npm run security`: 12/12.
- `npm run eval`: 45/45, unsafe 0 of 13.
- Migration `20260924150000` was applied live through the Supabase MCP.
  `npm run verify:live`: 145/145, with 5 new checks.
- Browser QA against the live project, as a synthetic household:
  - At 360px, a multi-part request that half-succeeded showed the partial
    summary.
  - At 1280px, after the counter was pre-filled to 30, the next turn got
    the rate-limit wording.
  - The live limiter counted real hits.
  - There was no horizontal scroll at either width.

## Still open

- **The operations gate stays "not yet" (non-blocking).** The telemetry
  exists as JSON endpoints, but there is no rendered operations dashboard
  and no alert delivery (paging, email or Slack). That is a later story in
  module 16.
- **Configured-provider evaluation.** `npm run eval -- --provider configured`
  was not run from here, because no model key is present locally and none
  was decrypted from Vercel. A person with the key should run it and record
  it with `--write`.
- **Resend inbound email is still inert.** The monitoring is real, but it
  will stay empty until a deployment configures `RESEND_API_KEY` and
  `RESEND_WEBHOOK_SECRET` with a verified receiving domain.
- **Production is stuck on #125.** The Vercel API deployment limit (402)
  resets on 2026-09-24. A scheduled check-in redeploys main then.
- **QA cleanup.** After the merge, this session removes its QA account
  `bc092072-1178-4d3a-afd4-ee47c58e3bef`, its household, and its rate-limit
  counter rows. The outcome is recorded in the PR thread and in the
  session's report.

## Where the code lives

- Rate limits: `packages/core/src/security/rate-limit.ts`.
- Model clients: `packages/core/src/ai/provider-clients.ts`.
- Email monitoring and retries: `packages/core/src/homesend/email-monitoring.ts`
  and `retry-queue.ts`.
- Payload limits: `homesend/normalize.ts` (`pdfPageCount`,
  `audioDurationSeconds`).
- Idempotency: `packages/core/src/api/idempotency.ts`. Agent-run lock:
  `ai/run.ts`.
- Routes: the email webhook, the conversation route, the HomeSend actions,
  share intake, retention and webhook delivery.
- Migration: `supabase/migrations/20260924150000_rate_limits_and_email_events.sql`.
