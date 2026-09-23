# The HomeTalk / HomeSend / HomeBrain test specification: mapped, gaps closed, defects fixed

**Date:** 2026-09-23 · **Report:** `docs/testing/2026-09-23-hometalk-homesend-homebrain-test-report.md`

## What was done

- **Mapping.** Every one of the 97 cases in `design/TEST-CASES-HOMETALK-HOMESEND-HOMEBRAIN.md` was mapped to real tests.
  - Before: 51 covered, 37 partial, 2 gaps.
  - After: 89 covered, 7 partial, 1 failing (E2E-002).
- **New tests.**
  - `evaluation/test-spec.test.ts` covers the golden-household cases that span surfaces.
  - `homesend/email-webhook.test.ts` covers the webhook as one delivery path. The route's logic was extracted into `homesend/email-webhook.ts` to make that possible.
  - `conversation/action-audit.test.ts`.
  - HS-017 size boundaries.
  - Terminal-state and decide-once database tests.
- **Live end-to-end run.** Signed in, on a local server using the live Supabase project, with Gemini as the model. It covered E2E-001…006 and SEC-005 (image injection).
- **Defects fixed** (details in the report):
  - HomeBrain accepted invented times and unfounded answers.
  - Reconciliation missed "school meeting" = "parent-teacher meeting" and matched every homework to every other homework.
  - Connected-service provenance was mislabelled.
  - A waiting HomeSend item hid the date it claims.
  - Rejected actions were not terminal in the database.
  - A throwing model call crashed a turn.
  - HomeTalk writes were not audited with their channel, and a no-op add was audited as a change.
  - "Pay that bill" asked "Which bill?" on a noisy confidence.
  - "this Saturday, 26 September" left a school notice undated.
  - A day's only event, withheld from the model by consent, was answered "nothing scheduled".
  - A question naming one thing got a list of everything.
  - A paid receipt was offered as a bill to pay.

## Verified

- **Gates:** typecheck, lint, the migration, embed, boundary and secrets lints, tracker check, brand check, security suite.
- **Unit tests:** 2339 passing.
- **Database suite:** 442 passing.
- **Evaluation:** deterministic 45/45; Gemini 45/45, with Unsafe Action Rate 0/13.
- **Release artifact:** `docs/ai-releases/2026-09-23-google-p-5be0e787d77a.md`, which now records p50/p95/p99 latency per surface.
- **Migration:** `20260925110000_conversation_action_terminal_states` applied to the live project, and its trigger confirmed with SQL.

## Still open

- **Receipts → purchase history (E2E-002, P0).** `consumable_purchases` is modelled, but nothing writes to it. This needs a story: a new HomeSend candidate action, a commerce service, and undo.
- **Times of day in HomeSend extraction.**
- **Adding a child inline** from a school notice's review form.
- **HT-001, DATA-002, PERF-003, SEC-007, X-008, UX-001, UX-002.** Database, route or rendered-UI tests still to write.
- **Verdict.** By the spec's release rule this is not production-ready while E2E-002 fails.

## Where the code lives

See "Where the code lives" in the report.
