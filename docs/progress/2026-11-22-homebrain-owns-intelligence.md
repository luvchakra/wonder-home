# HomeBrain holds the intelligence, HomeSend moves the data (2026-11-22)

**The ask** (owner, 2026-11-22): "keep one thing in mind that HomeBrain is supposed to have the intelligence related algorithms, homesend is supposed to have the data transfer related features. so put the code accrdingly"

The week's intelligence (the model-led decision, the registry, decision memory, learned rules, exam and timetable understanding, matching) had grown inside `packages/core/src/homesend/`. This change moves it into `packages/core/src/homebrain/` without changing what it does, and adds a test that keeps it there.

## What moved where

INTELLIGENCE means understanding, deciding, matching, learning, scoring or judging. TRANSFER means getting data in and out. Modules were moved with `git mv`, so their history is kept. Their tests moved with them.

| Was (`homesend/`) | Class | Now |
|---|---|---|
| `capabilities`, `decision`, `understanding`, `verify`, `completeness`, `confirmation`, `auto-add`, `above-bar`, `record-first`, `checking`, `reconcile`, `resolve`, `plan`, `document`, `injection`, `when`, `school-note`, `payment-proof`, `health-filers`, `audio`, `tidy`, `tidy-model` | INTELLIGENCE | `homebrain/intake/` (same names) |
| `decision-memory`, `decision-rules`, `learned`, `learned-repository` | INTELLIGENCE (learning) | `homebrain/learning/` |
| `exam-match`, `timetable` | INTELLIGENCE (school) | `homebrain/school/` |
| `ingest`: `defaultClassify`, `strongerClassify`, `defaultTranscribe` (the model and speech readers) | split | `homebrain/intake/readers.ts`; `ingest.ts` keeps the pipeline and takes these as its `IngestDeps` defaults |
| `matched-update`: `matchOnRecord`, `canRecordBill` | split | `homebrain/intake/bill-match.ts`; the governed writes stay |
| `syllabus-apply`: `planSyllabus`, `studyText`, `notesWithExtras` | split | `homebrain/school/syllabus.ts`; attaching stays |
| `add-default`: `canAdd`, `billRecords`, `receiptLines` | split | `homebrain/intake/can-add.ts`; `addWaitingItem` stays |
| `deadlines`: `notHouseholdInformation` | split | `homebrain/intake/household-information.ts`; the timers and question builders stay |
| `tidy-run`: choosing the tidy judge's model under the data-use policy | split | `homebrain/intake/tidy-judge.ts`; the job and its writes stay |
| `waiting`: `RETRY_CAP`, `daysBetween` | moved within HomeSend | `homesend/items.ts` (re-exported from `waiting`), so HomeBrain's tidy rules no longer load `waiting` and no import loop forms |
| channels (`email-*`, `share-handoff`, `addresses`, `channels`, `link-fetch`, `rate-limit`), `ingest` orchestration, `normalize`, `security`, `malware-scan`, `repository`, `changes`, `apply`, `retry-queue`, `model-unavailable`, `deadlines`, `needs-you`, `sender-trust`, `sender-pretrust`, `trusted-arrival`, `sender-history`, `talk`, `timetable-words`, `timetable-apply`, `syllabus-apply`, `matched-update`, `payment-apply`, `add-default`, `new-kind`, `tidy-run`, `inbox-view`, `daily-summary`, `metrics`, `remove`, `record-types`, `items`, `archive-reasons`, `waiting` | TRANSFER | stay in `homesend/` |

Mostly-TRANSFER files that only call a decision (`new-kind`, `sender-history`, `timetable-apply`, `waiting`) stay in HomeSend and call HomeBrain through the interface.

## The interface

`homebrain/intake-api.ts` is the one door from HomeSend into HomeBrain. It re-exports exactly the names HomeSend uses: readers, understanding, decision and validation, learned rules and decision memory (`rememberDecision`, `recordDecisionOutcome`), matching, school planning, and the tidy rules and judge. The functions are the same ones HomeSend called before.

## The guard

`homebrain/intake-boundary.test.ts` checks three things:

- No HomeSend file loads a model client (`ai/provider-clients`, `ai/model-client`, a provider SDK), a model reader (`ai/classify-intake`, `ai/read-words`, `ai/credentials`, `ai/model-key`) or embeddings at run time.
- HomeSend imports no HomeBrain module except `homebrain/intake-api`.
- No HomeBrain file calls a HomeSend channel (`whatsapp/`, `email/`, `homesend/email-*`, `share-handoff`, `channels`, `addresses`, the sender-trust modules, `link-fetch`, `retry-queue`, `ingest`, `rate-limit`, `malware-scan`, `security`).

X-003 (`evaluation/test-spec.test.ts`) now reads `homebrain/intake/`, `learning/` and `school/` as well as `homesend/`. Moved code still touches no table but HomeSend's own.

## Verified

- `tsc --noEmit` passes for `packages/core` and `apps/web`.
- ESLint on the changed web files: 0 errors.
- Unit tests: `packages/core` 492 files and 6331 tests pass; `apps/web` 32 files and 167 tests pass.
- `npm run security`: 12/12 areas pass.
- `npm run tracker -- --check` passes.
- `npm run eval`: 489/489, Unsafe Action Rate 0/82, every gate as before.
- Build and `check:bundle` pass.
- Targeted live run on the configured provider:
  - HD-01, HS-106 and HT-196 pass.
  - `--set learning` (new: only the unseen-kind and replay measures) gives 10/12. HS-L01 passes. HS-L02 and HS-L12 are read as `event`, exactly as in the first live eval, so live behaviour is unchanged.
- No SQL was needed. This is a pure move.

## Open

- None from the move. The open live failures from the first live eval (`2026-11-22-first-live-eval.md`) are unchanged by it.
