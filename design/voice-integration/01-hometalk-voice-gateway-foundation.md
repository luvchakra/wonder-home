# WonderHome — HomeTalk Voice Gateway Foundation

## Purpose

Implement the canonical voice/conversation integration boundary for WonderHome.

This is **Phase 1** and must be completed before implementing Gemini Voice or Alexa adapters.

The architecture decision is:

> Alexa and Gemini Voice are external interaction surfaces. HomeTalk remains the canonical WonderHome conversation/action gateway. HomeBrain remains the shared household intelligence layer.

Do not create separate AI pipelines for Alexa and Gemini.

## Source of truth

Before changing code:

1. Inspect the current `main` branch of `https://github.com/luvchakra/wonder-home`.
2. Inspect existing HomeTalk, HomeBrain, auth, API, context, autonomy, and domain-service code.
3. Reuse existing abstractions where they exist.
4. Do not assume paths/types from this document are already present.
5. Preserve existing RLS, authorization, autonomy and fail-closed behavior.

## Goals

Create a provider-neutral internal contract that accepts voice/text requests from:

- WonderHome web/mobile HomeTalk
- Gemini Voice
- Alexa
- Future voice channels

and routes them through the same understanding, context, authorization and execution pipeline.

## Required flow

```text
Voice/Text Channel
       |
       v
Voice/Conversation Adapter
       |
       v
HomeTalk Gateway
       |
       +--> identity resolution
       +--> household/member resolution
       +--> conversation context
       +--> HomeBrain/context retrieval
       +--> intent/entity resolution
       |
       v
Model Router / Understanding
       |
       v
Structured action proposal
       |
       v
Deterministic governance
       |
       +--> validate
       +--> scope
       +--> entitlement
       +--> permission
       +--> autonomy
       +--> approval
       |
       v
Domain executor
       |
       v
Actual result
       |
       v
Natural-language/voice response
```

## Canonical request contract

Create or adapt an internal type equivalent to:

```ts
type HomeTalkChannel =
  | "web"
  | "mobile"
  | "gemini_voice"
  | "alexa";

type HomeTalkRequest = {
  channel: HomeTalkChannel;
  householdId: string;
  memberId: string;
  sessionId: string;
  requestId: string;
  input: {
    text: string;
    locale?: string;
    modality: "text" | "voice";
  };
  device?: {
    provider: "gemini" | "amazon";
    externalDeviceId?: string;
    deviceName?: string;
  };
  conversation?: {
    conversationId?: string;
    previousTurnIds?: string[];
  };
  capabilities?: string[];
};
```

Adapt this to existing project conventions rather than blindly creating duplicates.

## Response contract

The gateway must return a structured result that can be rendered by any voice surface:

```ts
type HomeTalkResponse = {
  requestId: string;
  status:
    | "answered"
    | "clarification_required"
    | "approval_required"
    | "completed"
    | "failed"
    | "not_authorized";
  speech: string;
  displayText?: string;
  action?: {
    proposed: boolean;
    executed: boolean;
    actionId?: string;
  };
  clarification?: {
    question: string;
    options?: string[];
  };
  approval?: {
    approvalId: string;
    expiresAt?: string;
  };
};
```

Do not expose internal prompts, raw model output, secrets, tokens or sensitive context.

## Voice-specific requirements

Voice responses must be:

- concise by default
- understandable when heard once
- free of UI-only references such as "click here"
- explicit about ambiguity
- explicit about approval when required
- never claim "done" unless the deterministic executor succeeded

Example:

Bad:
> "The mutation was successfully persisted."

Good:
> "I've added milk to the grocery list."

## Identity resolution

Do not trust a voice provider identity as household authorization.

The gateway must resolve:

```text
provider identity
    -> linked WonderHome identity
    -> household
    -> member
    -> allowed scopes
```

If identity is not linked, return an account-linking/onboarding response.

If the linked identity cannot be resolved safely, fail closed.

## Conversation state

Conversation state is not household truth.

Use conversation state for references such as:

- "that"
- "the older one"
- "add the same thing"
- "remove it"

But always resolve the final entity/action against authoritative household/domain data before execution.

## Safety

Never allow:

- external voice provider
- model output
- conversation memory

to become the authorization authority.

The final action must pass the existing deterministic governance pipeline.

## Idempotency

Every external request must have a stable request/idempotency identifier.

Duplicate delivery must not:

- add an item twice
- create duplicate events
- send duplicate notifications
- execute a payment twice
- repeat destructive actions

## Observability

Record safe metadata:

- request ID
- channel
- household ID
- member ID
- domain
- intent
- action ID
- result status
- latency
- provider/model metadata where safe

Do not store:

- raw credentials
- OAuth tokens
- secrets
- unnecessary raw voice recordings
- full sensitive prompts

unless an explicit retention policy allows it.

## Tests

Add tests for:

1. text request through HomeTalk
2. voice-channel request through HomeTalk
3. valid linked identity
4. unlinked identity
5. cross-household identity attempt
6. ambiguous entity
7. clarification
8. approval-required action
9. autonomous allowed action
10. denied action
11. executor failure
12. duplicate request
13. conversation reference resolving to stale entity
14. "Done" only after executor success

## Acceptance criteria

- [ ] One canonical HomeTalk gateway exists.
- [ ] Web/mobile HomeTalk continues working.
- [ ] Provider-specific adapters are not allowed to bypass the gateway.
- [ ] Identity is resolved before household context is accessed.
- [ ] Domain writes still use deterministic executors.
- [ ] Autonomy remains fail-closed.
- [ ] Tests pass.
- [ ] No security boundary is weakened.

## Completion marker

Before starting Phase 2, produce a short implementation summary:

- files changed
- APIs/types added
- tests added
- any existing abstractions reused
- any blockers
