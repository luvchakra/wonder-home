# The agent pipeline runs for real, triggered from HomeTalk

## What happened

Module 14's specialist/orchestrator/tool-gate architecture (five domain
specialists, `coordinate()`, `executeStep()`/`advance()`, the governed
`TOOLS` registry) was fully built and unit-tested but never wired to
anything live: `agent_runs` had zero rows in production, and nothing —
no route, no cron, no conversational intent — ever called `coordinate()`.
This closes that gap for the manual-trigger path (Phase B of a larger
HomeTalk/HomeBrain/HomeSend initiative; Phase A, the HomeTalk/HomeBrain
rename, shipped earlier today in PR #75).

## What shipped

- **`packages/core/src/ai/gather-assessments.ts`** — `householdAssessments()`
  calls the six existing `*Agenda()` functions (meals, finance, shopping,
  home, family, school) in parallel and flattens their `HomeAssessment[]`
  fields into the one list `coordinate()` needs. Pure aggregation over
  already-real reads.
- **`packages/core/src/ai/executors.ts`** — the write behind an authorized
  step, one function per tool name the specialists actually emit:
  `list.add_item` → `createConsumable` (same call shape the conversation
  engine's own `addToGroceries` already uses), `home.book_service` →
  `createServiceRequest` (the honest capability behind "book a
  technician" when no booking provider is connected — raising the
  request). `bills.pay` always routes through `prepareIntent`'s
  stop-at-approval path regardless of what the autonomy gate decided,
  since no payment provider is live; `outcomes.replan` and every other
  tool with no real backing write return `performed: false` rather than
  a silent no-op, and `run.ts` records that as `refused`, never as
  `executed` — a step nothing actually did is not a step that succeeded.
- **`packages/core/src/notifications/create.ts`** — the first real bridge
  from `decideNotification()`'s pure output to a `notifications` row.
  Members have no INSERT policy on that table, so this runs on the admin
  client after the run's own household-boundary check; it reads for an
  existing open thread first and updates in place rather than trying an
  `ON CONFLICT` against `notifications_one_open_per_thread`, which is a
  partial index PostgREST's upsert can't target directly.
- **`packages/core/src/ai/run.ts`** — `runHouseholdAgents()`: checks the
  `ai.agent_runs` entitlement, inserts a real `agent_runs` row (admin
  client — same reason as notifications), gathers assessments, plans via
  `coordinate()`, and for each step resolves autonomy through the live
  `wh.autonomy_for()` RPC (the first TypeScript caller of that function),
  authorizes through the existing gate, executes or logs a refusal to
  `agent_tool_calls`, and creates a notification for anything left
  `awaiting_approval`. Stops at the first non-executed step, exactly as
  `advance()` already intends — steps after it were planned assuming it
  happened.
- **Two triggers.** A new `check_agents` conversational intent, recognized
  deterministically by phrases like "check on things" / "run my agents" /
  "what do my agents see" (`conversation/rules.ts`), wired through
  `conversation/executor.ts` into `runHouseholdAgents()` and replied with
  its plain-language summary — the literal "wire up with HomeTalk" ask.
  And `POST /households/{householdId}/agents/run`, membership-gated, for
  a direct, cron-ready entrypoint. A scheduled/autonomous trigger is
  explicitly **not** part of this — the `proactive_agents` flag (already
  exists, defaults `false`) is the natural gate for that later, once the
  manual path has been proven.

## Verified

- `npm run verify`'s full gate: typecheck, lint, migrations/embeds/
  boundaries/secrets lint, tracker/brand checks, security suite, 1339+
  unit tests (new coverage: `rules.test.ts`'s `check_agents` phrasing
  block and an `ACTION_KIND`/`proposeFromIntent` assertion, both green),
  239 DB/RLS tests, production build, 260 e2e — including a new OpenAPI-
  coverage entry for `/households/{householdId}/agents/run` that the
  first pass caught missing.
- No new migration — `agent_runs`, `agent_tool_calls` and `notifications`
  already existed with exactly the RLS shape this needed (member/admin
  SELECT, no member INSERT), so `npm run verify:live` needed no new check
  beyond confirming that shape is what's actually live.
- **Live-browser-verified** against a QA household upgraded to the `pro`
  plan (directly via SQL — Bills needs `finance.bills`, which `free`
  doesn't carry): seeded a bill due today with a real amount, signed in,
  typed "check on things" into HomeTalk. Confirmed via direct SQL against
  the live project: a real `agent_runs` row (`plan` correctly holding the
  planned `bills.pay` step with its rationale), a real `agent_tool_calls`
  row recording `outcome: refused`, `refusal_code: autonomy_forbids`,
  `reason: "This outcome is set to observe only."` — the fresh household
  had no responsibility configured for that outcome key, so
  `wh.autonomy_for()` correctly defaulted to `observe` and the gate
  correctly refused rather than silently doing nothing. This is the
  right behavior for an unconfigured household, not a bug: an
  unconfigured outcome is never acted on. QA household (and the manual
  `pro`-plan override) deleted afterward via `households` cascade; QA
  auth user deleted via `qa-test-user.mjs delete`.

## What's still open

- The refused-payment path was the one exercised live; the `executed`
  path (`list.add_item` via a meal's `shop_for_meal` contract) is
  covered by `createConsumable`'s own existing tests and the identical
  call shape already live in `conversation/executor.ts`'s
  `addToGroceries`, but wasn't separately driven through
  `runHouseholdAgents()` in a browser this session — a natural follow-up
  is a QA household with a responsibility set to `execute` and a meal
  genuinely missing two essential ingredients, to see a real
  `consumables` insert happen end to end through the agent path.
  `list.add_item`'s tool risk is `safe`/`draft`, so it always executes
  regardless of autonomy mode — this case doesn't need any autonomy
  configuration to exercise, just the meal setup.
- HomeSend (Phase C) and the CLAUDE.md/progress-note pass naming
  HomeTalk/HomeBrain/HomeSend as the standing architecture (Phase D) are
  not part of this change.
- No scheduled/autonomous trigger — every run today is asked for, by a
  person, through one of the two entrypoints above.

## Where the code lives

- `packages/core/src/ai/gather-assessments.ts`
- `packages/core/src/ai/executors.ts`
- `packages/core/src/ai/run.ts`
- `packages/core/src/notifications/create.ts`
- `packages/core/src/conversation/{intent,rules,proposal,executor}.ts` —
  the `check_agents` wiring
- `apps/web/app/api/v1/households/[householdId]/agents/run/route.ts`
- `apps/web/app/api/v1/households/[householdId]/conversation/route.ts` —
  passes the triggering member's identity through to the executor
- `packages/core/src/api/openapi.ts` — the new endpoint's entry
