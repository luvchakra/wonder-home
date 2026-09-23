# WonderHome Wave 4 — HomeTalk 2.0: Contextual Conversational Operations

**Status:** Product Council approved — implementation specification  
**Prerequisite:** Wave 1 — Context Engine  
**Recommended dependency:** Wave 2 — HomeBrain 2.0  
**Primary outcome:** HomeTalk becomes the reliable conversational control surface for household operations.

## 1. Product Definition

HomeTalk should feel like:

> **“I can simply tell WonderHome what is happening at home.”**

It must handle natural language, voice, references, follow-ups, corrections, cross-domain reasoning and reliable system updates.

## 2. Current Baseline

The current main branch already has:

- `conversation/engine.ts`
- text/voice channel abstraction
- model-backed understanding via `ai/model-client.ts`
- deterministic fallback rules
- structured `HouseholdIntent`
- clarification handling
- pending approvals
- transcript-confidence safety
- executor/governance boundaries
- conversation history

Wave 4 strengthens contextual understanding; it does not replace the governed execution architecture.

## 3. Target Pipeline

```text
User speech/text
 ↓
Transcript / normalized utterance
 ↓
Conversation state
 ↓
Current UI context
 ↓
Wave-1 household context
 ↓
HomeBrain retrieval
 ↓
AI contextual understanding
 ↓
Entity resolution
 ↓
Reference resolution
 ↓
Intent validation
 ↓
Conflict detection
 ↓
Proposal
 ↓
Scope → entitlement → permission → autonomy
 ↓
Approval if required
 ↓
Existing domain executor
 ↓
Verification
 ↓
HomeBrain refresh
 ↓
Response
```

## 4. Contextual Understanding

Current question:

> What did the user say?

Target question:

> What did the user mean, given this household?

Example:

> “Put that on the list.”

Use:

- recent conversation
- last HomeSend intake
- recent household changes
- pending proposal
- currently relevant entity

If two candidates remain:

> “Do you mean the white T-shirt from the school notice or printer paper?”

## 5. Intent Contract

The model still returns a semantic request, not database authority.

Suggested internal shape:

```ts
type ContextualIntent = {
  action: string;
  target: {
    kind: "member" | "entity" | "list" | "event" | "outcome" | "unspecified";
    mention: string;
  };
  parameters: Record<string, unknown>;
  confidence: number;
  references: Array<{
    phrase: string;
    resolvedEntityId: string | null;
    confidence: number;
  }>;
};
```

The server resolves actual ids.

## 6. Entity Grounding

Example:

> “Move Asmi’s maths homework to tomorrow.”

AI may identify:

- person mention = Asmi
- subject = maths homework
- date = tomorrow

The server resolves:

- Asmi → canonical member UUID
- maths homework → canonical school item UUID
- tomorrow → deterministic local date

Only then should an action proposal exist.

## 7. Temporal Grounding

Support:

- today
- tomorrow
- tonight
- this Friday
- next Friday
- this weekend
- next week
- after school
- before dinner

The model interprets the phrase; deterministic code resolves the actual date/time using the household timezone.

## 8. Reference Resolution

Support:

- this
- that
- it
- them
- the other one
- the older one
- the same bill
- the previous appointment

Priority:

1. current turn
2. pending clarification
3. pending proposal
4. recent conversation
5. recent HomeSend
6. relevant household context

If ambiguity remains, ask.

## 9. Conversational Corrections

Support:

> “Actually, make that Friday.”

> “No, I meant Manan.”

> “Not milk, almond milk.”

A correction modifies the pending semantic operation before a write occurs where possible.

If the prior action already executed, create a new corrective intent using the normal update/undo path; never rewrite history invisibly.

## 10. Multi-Step Requests

Example:

> “Add milk and bananas, and remind me to buy them tomorrow.”

Decompose into independently validated operations:

```text
1. add milk
2. add bananas
3. create reminder
```

Do not let one unapproved/failed action become the premise for downstream actions.

## 11. Cross-Domain Commands

Example:

> “Plan pasta for tonight and make sure we have everything.”

Potential semantic result:

```text
Meals
  plan pasta

Groceries
  identify missing ingredients
```

The model proposes. Domain services and governed tools determine what can actually happen.

## 12. Reliable Updates

Mandatory invariant:

```text
AI proposes
 ↓
Governed layer authorizes
 ↓
Domain service executes
 ↓
Executor returns actual result
 ↓
Context refreshes
 ↓
Response describes actual result
```

Never say “Done” when nothing was written.

## 13. Consequential Actions

### Payments

Resolve the exact bill and amount, then apply the existing finance permission, entitlement, autonomy and step-up approval gates.

### Ordering

Resolve the exact item/quantity/provider. If no live merchant exists, honestly prepare/refuse.

### Access changes

Never allow a model to bypass permission checks.

## 14. Voice

Voice and text must share one semantic engine.

For low transcript confidence on consequential instructions:

> “I heard … Can you confirm?”

Do not act on uncertain audio.

## 15. HomeTalk + HomeSend Convergence

HomeSend may create context that HomeTalk immediately uses.

Example:

HomeSend:

> Sports Day Saturday. Bring a white T-shirt.

HomeTalk:

> “What does Asmi need?”

Expected answer should use the newly confirmed HomeSend/domain state.

Likewise a successful HomeTalk preference/change must be visible to HomeSend reconciliation.

## 16. Conversation State

Persist:

- session
- recent messages
- pending proposal
- pending clarification
- resolved references
- action result
- context timestamps

Never persist raw chain-of-thought or provider credentials.

## 17. AI Prompt Contract

The model receives:

### System
- semantic role
- structured output schema
- instruction hierarchy
- safety rules

### Runtime context
- current member role
- local date/time
- relevant grounded entities
- relevant household facts
- conversation history
- pending state

### User message

Only the actual utterance.

Do not send the whole household to every turn.

## 18. Deterministic Safety Nets

Retain rule-based support for common patterns such as:

- add grocery item
- record absence
- status question
- plan event
- adjust schedule
- set preference
- payment request
- order request
- greeting/help

Model augmentation must not remove deterministic fallback behavior.

## 19. Validation Before Execution

Every contextual intent passes:

```text
Schema validation
 ↓
Entity validation
 ↓
Field validation
 ↓
Domain validation
 ↓
Permission
 ↓
Entitlement
 ↓
Autonomy
 ↓
Approval
```

Never let the model invent a trusted database id.

## 20. Confidence UX

Avoid exposing raw probabilities unless useful.

### High

Normal response.

### Medium

> “I think you mean …”

### Low

> “I found two possibilities …”

Keep numeric confidence internally for evaluation.

## 21. Required Examples

### School

- “What does Asmi have tomorrow?”
- “Move Manan’s science project to Friday.”
- “Mark Asmi’s worksheet complete.”

### Groceries

- “We’re out of atta.”
- “Add the same milk we bought last week.”
- “Remove the bananas.”

### Meals

- “What are we eating tonight?”
- “Plan something vegetarian for tomorrow.”

### Finance

- “Which bills are due this week?”
- “Prepare the electricity payment.”

### Home

- “The washing machine is making that noise again.”
- “Raise a service request.”

### Family

- “Protect Saturday evening for family time.”

### Health

- “When is my next checkup?”
- “Log my weight as 71.5 kg.”

Health actions remain privacy- and authorization-controlled.

## 22. Evaluation Matrix

Test:

- contextual references
- Asmi vs Manan
- ambiguous child reference
- date expressions
- corrections
- voice confidence
- payments/orders/access changes
- cross-domain plans
- HomeSend-created context
- previously executed action corrections

## 23. Acceptance Criteria

Wave 4 is complete when:

- HomeTalk is genuinely model-driven when a provider is configured
- Wave-1 contextual grounding is used
- HomeBrain retrieval is reused
- references resolve reliably
- ambiguity creates focused clarification
- dates resolve deterministically
- corrections work
- multi-step requests decompose safely
- text and voice share one semantic engine
- low-confidence consequential voice commands are confirmed
- every mutation goes through governed tools/domain services
- actual executor results determine response claims
- HomeTalk and HomeSend share household truth

## 24. Product Principle

> **HomeTalk should understand the household, not just the sentence.**
