# CLAUDE.md now names HomeTalk, HomeBrain and HomeSend as the standing architecture

## What happened

Phase D of the HomeTalk/HomeBrain/HomeSend initiative — the last of the
four phases from the original plan (A: rename, B: wire the specialist
pipeline into a real governed run, C: HomeSend v1). Phases A–C are merged
and live; this phase updates CLAUDE.md's own prose to describe them,
deliberately last so the contract never claimed something that wasn't true
yet.

## What shipped

- **CLAUDE.md**: a new "## The agent platform: HomeTalk, HomeBrain,
  HomeSend" section, placed right after the design-principles block and
  before "## Product rules" — naming each surface, where its code lives,
  and how they compose into the pipeline the architecture diagram
  describes (Inputs → Intake → Understand → Decide & Plan → Take Action →
  Outcome). Every function/module name in it was checked against the
  actual source (`ai/gather-assessments.ts`, `ai/specialists.ts`'s
  `coordinate()`, `ai/orchestrator.ts`'s `executeStep()`/`advance()`,
  `ai/tools.ts`'s `authorizeToolCall()`, `ai/executors.ts`, `ai/run.ts`'s
  `runHouseholdAgents()`, `conversation/brain.ts`, `ai/model-client.ts`,
  `packages/core/src/homesend/`, `ai/classify-intake.ts`) rather than
  written from memory — including the `proactive_agents` flag name and its
  current `false` default, confirmed against `config/flags.ts`.
- **Rule 13** ("One door to the assistant, not one per screen"): its
  example phrase "Talk to WonderHome" corrected to "HomeTalk" (the real
  nav/UI name since Phase A), and a line added carving out HomeSend's
  paperclip explicitly as a second *modality* of the one door, not a
  second door — this is the exception PR #78 already built and
  documented in `design/DESIGN-NOTES.md`; the rule itself just now says so.
- The "Talk and text share one conversation engine" product rule gained
  ", backed by HomeBrain" so the two names are tied together where a
  reader would first look for them.

## Verified

No code changed — this is a documentation-only pass. `npm run tracker --
check` (untouched, 21 modules current) and the rest of the fast gates were
re-run to confirm nothing else drifted; the substance was checked by cross-
reading every code reference in the new section against the actual files
listed above.

## What's still open

Nothing new — this closes out the four-phase plan. The open items already
recorded in `2026-09-21-homesend-v1-intake-channel.md` (no AI provider
configured in this environment to exercise HomeSend's classify step
end-to-end, no inbox view of stuck-pending intake items, real WhatsApp/
email webhooks) still stand as the next things to pick up if this
initiative continues.

## Where the code lives

- `CLAUDE.md`
