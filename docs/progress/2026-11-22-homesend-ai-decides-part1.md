# HomeSend: the model decides, part 1 — registry and one validated decision (14-081)

**Why.** The owner, 2026-11-22: "i want the the HomeSend to have ai based intelligence and it should be able to decide what to do with incoming info by applying ai algorithms and take decisions. new kind, unseen incoming messages should be analysed by ai and learnt over time to take the right decision in automated way". Design and the five-PR plan: `docs/design/2026-11-22-homesend-ai-decides.md`.

**What was done.**
- `packages/core/src/homesend/capabilities.ts`: the capability registry, 19 record types HomeSend may create, update or attach to, each with its owner module, safety class (record, money, health, action), fields, required fields and the governed write a person's confirm uses.
- `packages/core/src/homesend/decision.ts`: `HomeSendDecision` (what it is, nearest kind, new kind, operations with fields, who for, evidence and confidence, at most one question); `decisionFromReading` expresses today's reading as a decision (timetable → exams, syllabus → attach exam portion, payment message → attach payment, a document's records → one operation each, needs → To Buy, unknown → household note); `validateDecision` enforces the guardrails after any decision.
- `ingest.ts` `understand` stores the validated decision on every readable item (`understanding.decision`, jsonb; no migration). Nothing downstream reads it yet: no visible change.
- CLAUDE.md and `docs/agent-platform.md` now say HomeSend's model decides, and which rules still bind it.

**Verified.** `npx vitest run packages/core/src/homesend/` 55 files, 712 tests pass (13 new in `decision.test.ts`); evaluation and WhatsApp intake suites 510 pass; `npm run eval` (deterministic, recorded readings) 489/489, unsafe actions 0/82; core typecheck clean.

**Not verified live.** The container has no model key, so no provider run. This PR changes no prompt and no model call; the next one (14-082) does, and needs a live run.

**Open.** 14-082 to 14-085 in `backlogs/14-AI-Orchestration-and-Learning.md`. No migration, no help words (nothing user-facing), no test data created.
