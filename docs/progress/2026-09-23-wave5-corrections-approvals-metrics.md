# Wave 5, part 2: corrections as evidence, approvals bound to the exact proposal, production quality metrics (story 14-013)

**Spec:** `design/AI-EVALUATION-WAVE-5.md` §13, §20, §23.

## What was done

- **§13 Corrections are structured evaluation evidence.**
  - Table `ai_corrections` (migration `20260924140000`) holds one row per
    corrected field. Each row records:
    - the surface and the source record;
    - a closed-word `error_type`: `false_entity_match`, `wrong_date`,
      `wrong_item`, `wrong_amount`, `wrong_interpretation`,
      `wrong_classification` or `wrong_fact`;
    - the model and human values, each capped at 200 characters;
    - whether a model or the rules had understood it;
    - the prompt version running at the time.
  - Access:
    - The table is append-only. An update trigger refuses even the service
      role.
    - Only the server writes it. Members have no insert, update or delete
      grants.
    - Only the household's admins can read it.
    - The rows go when the household is deleted.
  - Pure derivations live in `packages/core/src/evaluation/evidence.ts`.
    Rows are written from three places:
    - **HomeTalk:** the conversation route, when a correction ("not milk,
      almond milk", "no, I meant Manan", "make that Friday") changed the
      request.
    - **HomeSend:** `routeHomeSendItemAction`, for each field the person
      changed on the review form.
    - **HomeBrain Review:** `reviewBelief`, for a corrected claim.
  - Recording is best-effort and never costs the household the correction
    itself.
  - `promptVersion()` moved to `evaluation/prompt-version.ts` (memoized), so
    production code stamps it without loading the golden households. The
    hash is unchanged.
- **§20 An approval binds to the exact proposal.**
  - `conversation/approval.ts` fingerprints each proposal. The fingerprint is
    a sha256 over the action, its target and every parameter with keys
    sorted, stored as `conversation_actions.approval_fingerprint`.
  - The card sends back the fingerprint it showed.
  - `decideAction` honours an approval only if all three hold:
    - it arrives within the 10-minute limit;
    - the stored proposal still hashes to its fingerprint;
    - the fingerprint the person saw is the current one.
  - Otherwise the proposal is closed as `expired`, with
    `result.reason = approval_expired|changed|stale`. The person is told
    nothing ran and to ask again.
  - This holds on every approval path: the card's Confirm, a spoken "yes",
    and "yes to both".
  - The explicit decision path had no time limit before. It has one now.
- **§23 Production quality.** `GET /api/v1/platform-admin/ai-quality`
  (`ai_operations.read`) is served by `evaluation/production.ts`. It reports:
  - household outcomes handled, from HomeTalk writes executed and HomeSend
    items routed;
  - model understanding share, and provider failures by code;
  - clarification rate;
  - HomeTalk update success;
  - HomeBrain grounded answers and validation refusals;
  - HomeTalk correction rate, and corrections by surface and error type;
  - refused approvals by reason;
  - unsafe actions: consequential actions executed with no approval step,
    which must be 0.

  All of it is read from closed words only (JSON-path selects of reply
  metadata codes, action type and status, correction type), never the
  content.
- The release artifact's operations gate evidence now names the AI-quality
  endpoint. The gate stays "not yet" until email-forwarding telemetry
  exists (part 3).

## Verified

- `typecheck`, `lint`, `lint:migrations`, `lint:embeds`, `lint:boundaries`
  and `lint:secrets` all pass.
- `npm run test`: 144 files, 2204 tests. The new `evaluation/part2.test.ts`
  covers the spec's ₹2,840→₹3,100 stale approval, changed, expired,
  legacy-row, evidence mapping and metrics arithmetic.
- `npm run test:db`: 423/423, including the new
  `scripts/test-ai-corrections-rls.mjs`, which checks:
  - admin-only read;
  - no member writes;
  - append-only even for the server;
  - closed-word checks;
  - fingerprint shape;
  - the cascade on household deletion.
- `npm run eval`: 45/45. The prompt version is unchanged at `p-fbca759c77b2`.
- The migration was applied live through Supabase MCP. `npm run verify:live`
  passes 140/140, including four new checks for `ai_corrections` and the
  fingerprint column.
- Browser, local dev server against the live project, QA household
  "QA Wave Five Home":
  - **Correction at 360px:** "add milk…" then "not milk, almond milk" wrote
    one `ai_corrections` row: `hometalk`, `wrong_item`, milk → almond milk,
    `rules`, `p-fbca759c77b2`.
  - **Approval at 360px:** "make me responsible for the dishes" and then
    Confirm sent the card's fingerprint. The approval was honoured.
  - **Stale approval at 1280px:** approving a fresh proposal with a
    mismatched fingerprint was refused ("That proposal changed after you saw
    it…"). The action closed as `expired` with `refused: "stale"`, and
    nothing ran.
  - No horizontal scroll at either width.
- `loadProductionMetrics` was run live against the real schema with a
  service-role client. The JSON-path selects resolved, and the counts
  reflected the QA turns: one wrong_item correction and one stale refusal.

## Still open

- **Wave 5 part 3:**
  - rate, payload and model-timeout limits;
  - email-forwarding telemetry and alerts (§14);
  - failure codes (§16);
  - conversation idempotency and retries (§17);
  - HomeSend and approval tests registered in `npm run security`.
- HomeSend corrections do not yet record a changed *person* ("who it's
  for"). The review form's subject choice isn't compared to what was
  resolved. HomeTalk and HomeBrain entity corrections are recorded.
- QA cleanup of the "QA Wave Five Home" household and user
  `1bea4b0a-088e-4ba5-a47b-ab425c80ab79` runs after this PR merges.
