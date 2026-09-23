# Household Context & Grounding Engine — Wave 1 (story 14-009)

**Date:** 2026-09-23
**Story:** 14-009 (new, P0, module 14 — AI Orchestration & Learning)
**Spec:** "WonderHome Wave 1 — Household Context & Grounding Engine"

## What was done

A shared context layer, `packages/core/src/context/`, that HomeTalk, HomeBrain
and HomeSend now all read from, in place of three separate partial views of the
household.

| File | Role |
|---|---|
| `types.ts` | `HouseholdContextItem`, `Resolution<T>`, match verdicts, tiers, freshness, privacy classes |
| `builders.ts` | Pure: domain records → canonical items (every shipped domain; brain.ts's fact wording ported verbatim) |
| `repository.ts` | `CONTEXT_ADAPTERS` — one permission-gated, RLS-bound read per domain; `gatherHouseholdContext` / `loadHouseholdContext` |
| `freshness.ts` | current / stale / historical / superseded / unknown; identity-group supersession (confirmed > authority > recency) |
| `provenance.ts` | Source + evidence per fact, HomeSend evidence attached to the record it created; never reasoning |
| `privacy.ts` | Viewer boundary: other household, finance permission, health permission and private health scope (subject or guardian only, no admin shortcut); opaque `fact-N` candidate ids for the consent gate |
| `resolution.ts` | `resolvePerson` / `resolvePet` / `resolveReference` / `resolveEntity` — resolve, clarify ("Which bill did you mean — A or B?") or ask ("Did you mean …?"); a consequential target needs ≥ 0.9 |
| `matching.ts` | exact_match, likely_duplicate, likely_update, related_but_different, contradiction, no_match; an older source never overrides a newer record |
| `conflicts.ts` | Schedule overlaps (the existing detector), contradictory facts, away-but-assigned |
| `retrieval.ts` | `findRelevantFacts` (question relevance by tier, mention, domain), `getCurrentState`, `getRecentChanges`, `getSupportingEvidence`, `createContextEngine` |
| `invalidation.ts` | The 45 s per-viewer cache and `invalidatesContext(write, householdOf)` — invalidates after success only |

Integration:

- **HomeBrain**: `conversation/brain.ts` is now a thin façade. `householdContext()` loads the engine's snapshot; the conversation route answers with `factsFor(context, question)`, so a narrow question sends its relevant facts marked relevant and the rest marked not relevant (the consent gate still decides). `brain.test.ts` passed unchanged, which confirms the facts are the same.
- **HomeTalk**: "Dad is away Friday", "the cook is off tomorrow" resolve through `resolvePerson` (relationship, nickname, helper occupation, older/younger by date of birth), and ask instead of guessing. Groceries check `matchIncoming` before adding a duplicate; health issues resolve through `resolveEntity`.
- **HomeSend**: `homesend/reconcile.ts` runs the same matcher before routing. A duplicate, update or contradiction is shown on the confirm step ("It's a different one — add it anyway" to override) instead of a second record being created quietly.
- **Invalidation**: `auditChange` invalidates the household, and every non-audited repository write (commerce, finance, school, family, meals, home, configuration, helpers) is wrapped with `invalidatesContext`.

Fixed along the way: HomeSend's route action never read `subjectMemberId`, `healthRecordType` or `documentDate` from the confirm form, so every health document was filed for the sender with default type and date.

## Verified

- `golden.test.ts` — the 14 council scenarios (35 cases): Asmi vs Manan, Father vs Mother, "that bill" with one and with several, duplicate school item, similar grocery names, private health, private appointment, confirmed preference supersedes learned, newer event supersedes stale, pet aliases, a helper is not family, HomeSend matching a record, "do that" after a proposal.
- `engine.test.ts` (18): every non-derived domain has an adapter; no context file imports `db/admin`/`createAdminClient` or calls `.rpc(`; a failed read is named in `unavailable`; a child, or an adult without `finance.view`, never triggers the restricted reads; relevance; opaque ids; provenance; privacy; invalidation only after success, only for that household.
- Gates: typecheck, lint, lint:boundaries, lint:migrations, lint:embeds, lint:secrets, security (9/9; its expected count for AI context minimisation raised 27 → 31, matching what it already declared), test (1699), test:scripts (43), test:db (381), build — all clean.
- **Live leakage check** (Supabase MCP, count-only, inside a DO block that raises so the transaction always rolls back): impersonating a real active member as `authenticated` with their JWT `sub`, the member saw **0** rows belonging to other households across all 29 tables the engine reads, while the owner role counted 35 such rows present (12 other households). Sanity check: `auth.uid()` resolved, the member saw their own 5 members and 1 of 13 households. No household content was read.

## Not done / needs a person

- No migration, so nothing to apply live.
- Browser QA of the HomeSend confirm-step notice and `npm run verify:live` were **not** run: this sandbox has no `apps/web/.env.local`, and the Vercel `SUPABASE_SERVICE_ROLE_KEY` is a sensitive variable that cannot be read, so the app cannot start signed in. Worth checking by hand: send a photo of a bill already on record and confirm the "already on record" notice and the override checkbox.
- No vector store, no second person source of truth, no new agent runtime (spec non-goals).
- `docs/PROGRESS.md` (generated) and `tracking/PROGRESS.md` disagree on the total story count (182 vs 171). This predates this story. The generated one is the one to trust.
