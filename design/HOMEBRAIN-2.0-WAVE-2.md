# WonderHome Wave 2 — HomeBrain 2.0

**Status:** Product Council approved — implementation specification  
**Prerequisite:** Wave 1 — Household Context & Grounding Engine  
**Primary outcome:** HomeBrain becomes the central household reasoning layer, not merely an answer composer.

## 1. Product Definition

HomeBrain should feel like:

> **“WonderHome knows how our household works.”**

It must combine relevant household state, household rules, responsibilities, preferences, history and evidence while respecting the viewer’s privacy scope.

## 2. Current Baseline

The current `conversation/brain.ts` already gathers a broad `BrainSnapshot` covering members, responsibilities, events, meals, consumables, orders, obligations, school items/communications, memories, absences and authorized health information. `ai/privacy.ts` then minimises content before model exposure.

Wave 2 should preserve that behavior while moving retrieval and grounding to Wave 1.

## 3. Responsibilities

HomeBrain must:

1. Understand the question.
2. Resolve who/what/when it concerns.
3. Retrieve relevant context.
4. Reason across domains.
5. Produce a grounded answer.
6. Explain why/source when useful.
7. Hand action requests to the existing governed action pipeline.

## 4. Cross-Domain Reasoning

HomeBrain must connect domains when the user's question naturally spans them.

Examples:

### School → household need

> “What does Asmi need for Saturday?”

May combine Sports Day, school requirements, existing household inventory and calendar.

### Meals → groceries

> “Can we make pasta tonight?”

Use planned meals, ingredient availability and grocery state.

### Appointment → family

> “Will the appointment clash with anything?”

Use the appointment and privacy-safe family calendar/conflict representation.

Do not expose private appointment details to an unauthorized viewer.

## 5. Context Selection

Target pipeline:

```text
Question
 ↓
Intent hints
 ↓
Entity/time/domain hints
 ↓
Wave-1 retrieval
 ↓
Candidate ranking
 ↓
Privacy filtering
 ↓
Evidence selection
 ↓
Grounded model prompt
 ↓
Model answer
 ↓
Grounding validation
 ↓
Response
```

## 6. Grounded Fact Contract

Use an internal structure such as:

```ts
type GroundedFact = {
  contextId: string;
  statement: string;
  sourceIds: string[];
  confidence: number;
  privacyClass: string;
};
```

The model may only use facts supplied in the grounded context.

## 7. Post-Generation Validation

Check for:

- unsupported names
- unsupported dates
- unsupported amounts
- unsupported events
- unsupported health claims
- unsupported provider/integration claims
- claims of completed actions that have no execution result

If validation fails:

1. regenerate with tighter context, or
2. use deterministic composition, or
3. explain that WonderHome does not know enough

Never silently accept a factually unsupported answer.

## 8. Corrections & Current Truth

A confirmed correction must supersede an older learned observation.

Example:

> “Asmi doesn’t like mushrooms.”

followed later by:

> “Actually Asmi is okay with mushrooms now.”

The current effective preference should be the second fact, with history/provenance preserved for review.

## 9. HomeBrain Review

The user-facing review surface should be called **HomeBrain Review**.

Show:

```text
What WonderHome knows
----------------------
Fact
Source
When learned
Confidence
Confirmed?
Edit
Remove
```

Do not use the older “Belief Review”/“Certification” naming in the user-facing feature.

## 10. “Why?” as a First-Class Capability

Support:

- “Why are you asking me this?”
- “Why didn’t you add that?”
- “Why do you think this is for Asmi?”
- “Where did this information come from?”

Answers should cite observable evidence, not hidden model reasoning.

Example:

> “The school notice you sent yesterday names Asmi, and I found an existing school item for her with the same subject.”

Never expose chain-of-thought.

## 11. HomeBrain Modes

### Answer
No mutation.

### Clarify
Essential information is missing or ambiguous.

### Prepare
Construct a possible change without applying it.

### Approval
Ask for explicit approval for a consequential change.

### Done
Only after a governed executor confirms the actual change.

## 12. Conversation vs Household Truth

Separate:

- conversation context
- household truth

A conversational statement is not an authoritative database fact until the normal intent/approval/domain-write path succeeds.

## 13. Health

Health context remains privacy scoped and non-diagnostic.

HomeBrain can answer factual household-management questions when authorized, but must not convert household records into diagnosis/treatment recommendations.

## 14. Model Prompt Contract

The HomeBrain answer prompt must state:

- supplied facts are the available world
- missing facts are unknown
- never invent a person/event/bill/plan
- never claim an action occurred without an execution result
- do not infer sensitive details without evidence
- use source evidence for ambiguous answers
- ask a targeted question when material uncertainty remains

The model must not receive system secrets, provider credentials or raw chain-of-thought.

## 15. Performance

Keep the current short-lived context cache as a starting point; preserve prompt latency targets by retrieving relevant context instead of every record.

Successful changes must invalidate relevant cached context.

## 16. Evaluation Questions

Cover at least:

- What do we need today?
- What does Asmi have tomorrow?
- What does Manan have tomorrow?
- Which bills are due this week?
- What groceries are running low?
- Can we make tonight’s planned dinner?
- What changed since yesterday?
- Why are you asking for approval?
- Where did this date come from?
- What did I just send you?
- What did WonderHome change after I sent it?
- What responsibilities belong to me?
- Which family events are protected?
- What health appointments do I have? (authorized vs unauthorized)

## 17. Acceptance Criteria

Wave 2 is complete when:

- HomeBrain uses Wave 1 retrieval/grounding
- cross-domain questions work
- contextual references resolve
- ambiguity creates focused clarification
- grounded responses are validated
- HomeBrain Review exposes provenance and current truth
- HomeTalk and HomeSend successful changes become visible to HomeBrain
- privacy boundaries remain intact
- model failures degrade honestly
- health behavior remains privacy-safe and non-diagnostic
- all existing verification gates remain green

## 18. Product Principle

> **HomeBrain should answer from what WonderHome knows, not from what a model can imagine.**
