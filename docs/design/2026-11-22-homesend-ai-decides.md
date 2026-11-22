# HomeSend: the model decides (2026-11-22)

**The ask** (owner, 2026-11-22): "i want the the HomeSend to have ai based intelligence and it should be able to decide what to do with incoming info by applying ai algorithms and take decisions. new kind, unseen incoming messages should be analysed by ai and learnt over time to take the right decision in automated way".

**Why.** Every new kind of message needed a new code path: an exam timetable with many rows was lost as "unknown", a good reading was filed as a note because a deadline step ran first, a syllabus waited for a special matcher (#593, #596, #600). Hand-written decisions don't scale to what families forward.

## What changes

1. **One decision, model-led** (`homesend/decision.ts`). For each item the model returns: what it is in free words and the nearest known kind (new kinds allowed); a list of operations (create, update or attach-to a record found by reference), each with fields, who it is for, evidence per field (a quote from what was sent or a record id) and a confidence; and at most one question, only when a wrong guess would matter.
2. **A capability registry** (`homesend/capabilities.ts`) is the whole of what it may pick: bills, payments, receipts, school items, exams, exam portions, classes, calendar events, reminders, To Buy, meals, recipes, tasks, routines, household notes, health records, places, contacts, and action requests. Each names its owner module, safety class, fields and the governed write a person's confirm uses. The special cases (timetable, syllabus, payment proof, matched bill update) become capabilities or validators, not pipelines.
3. **Unseen kinds** map to the nearest capability, usually a household note with its fields plus any dated thing as an event or reminder; the new kind's name is kept, grouped, and shown to Platform admin as a candidate capability. The reply says plainly what was done.
4. **Learning per household.** Every decision and what people did next (kept, confirmed, corrected which field to what, undone, answered) is a decision memory. The k most similar past decisions of the same household (embedding plus sender and kind) are given to the model as worked examples. A pattern confirmed N times with no correction becomes a learned rule in `homesend_learned_defaults`, applied before the model; one correction demotes it. The per-kind bar keeps following the undo and correction rate (`homebrain/kind-bar.ts`), new kinds included.

## What does not change (enforced in code after the model decides)

`validateDecision` runs on every decision, whatever made it:
- each operation is checked against its capability's schema; unknown capabilities, unsupported operations and missing titles are rejected; fields the capability doesn't own are dropped;
- a quote not in what was sent, or a record id WonderHome didn't hand over, rejects the operation: a reading naming something not in what was sent adds nothing;
- an update or attach must name a record on file;
- **actions** (paying, ordering, messaging outside the household, booking, cancelling, deleting, sharing) become a proposal that waits for a yes (`conversation/consent.ts`). WonderHome never pays;
- **money and health** keep "Money and health entries"; a default never confirms them; who a health record is for is never taken from a model, except a named member for a sender on "Who may file health records for others";
- content that tries to instruct WonderHome (`injection.ts`) caps every confidence below the bar;
- record first, with Undo; the Admin's bar decides confirmed or Checking. A learned rule never crosses households and never carries money, approval or permission. Unsafe Action Rate stays zero. WhatsApp is never an authorization channel.

## Order of work (each PR merged and deployed before the next)

| PR | Story | What |
|---|---|---|
| 1 | 14-081 | This note; registry; `decisionFromReading` expresses today's reading as a decision, validated and stored on the item (`understanding.decision`). No visible change; every eval case green. |
| 2 | 14-082 | The model returns the decision itself (classifier tool gains `whatIs`, `newKind`, `operations`); unseen kinds become a note plus dated things; plain reply; new kinds grouped. |
| 3 | 14-083 | Decision memory (table, outcomes from undo, correction and answers) and retrieval of similar past decisions as worked examples. |
| 4 | 14-084 | Promotion and demotion of learned rules; Admin view with "Why?" and Remove. |
| 5 | 14-085 | Measures: unseen-kind eval cases, replay cases for learning, before/after report, Platform admin "decided by AI", "learned rule applied", "new kinds seen". |

**Live model.** This container has no model key: PR 1 is verified on recorded readings only (`npm run eval`, deterministic). Each later PR states what is unverified live.
