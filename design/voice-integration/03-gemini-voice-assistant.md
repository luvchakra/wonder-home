# WonderHome — Gemini Voice Assistant Integration

## Purpose

Implement Gemini as a **voice interaction surface for HomeTalk**, using Google's Gemini Live API where appropriate.

Run this **after Phase 1 and Phase 2**.

## Critical architecture decision

Gemini Voice is NOT a second HomeBrain.

Do not create:

```text
Gemini -> its own WonderHome AI -> DB
```

Instead:

```text
Gemini Voice
     |
     v
Gemini Voice Adapter
     |
     v
HomeTalk Gateway
     |
     v
HomeBrain / Shared Context
     |
     v
Governed HomeTalk tools
     |
     v
Domain executors
```

## Current API basis

Google's Gemini Live API supports real-time conversational interaction and function calling. Current Google documentation lists function calling as a supported Live API tool.

Official documentation:
https://ai.google.dev/gemini-api/docs/live-api/tools

Before implementation, verify the currently supported Live API model, SDK/API surface and authentication mechanism against Google's current documentation.

Do not hard-code a model name from this document.

## Product goal

Allow a WonderHome member to speak naturally and get household-aware responses.

Examples:

- "What's happening tomorrow?"
- "Do the kids have homework?"
- "What's for dinner?"
- "Do we need milk?"
- "Add bananas to the grocery list."
- "Remind me about the school meeting."
- "What bills are due this week?"
- "What did WonderHome handle today?"

## Client/server boundary

Prefer:

```text
Gemini Voice Client
        |
        | authenticated HomeTalk session
        v
WonderHome HomeTalk API
        |
        v
HomeBrain + governed tools
```

The client should not receive privileged server credentials.

If the Live API requires a client-side credential/token, use the provider-supported ephemeral/short-lived mechanism where available rather than exposing a long-lived API key.

Verify the current Google security guidance during implementation.

## Voice session lifecycle

```text
start
  |
authenticate
  |
resolve member
  |
resolve household
  |
create HomeTalk session
  |
Gemini Live session
  |
voice input
  |
HomeTalk request
  |
context + reasoning
  |
tool proposal
  |
governance
  |
executor
  |
result
  |
voice response
  |
continue session
  |
end
```

## Function/tool design

Gemini should receive only narrowly defined WonderHome tools.

Examples:

```text
get_household_status
get_today_agenda
get_upcoming_events
get_meal_plan
get_grocery_status
add_grocery_item
get_school_items
get_bill_status
create_reminder
get_recent_household_activity
```

Do not expose:

```text
execute_sql
generic_database_query
admin_update
arbitrary_http
raw_supabase
```

Tools must be domain-specific and deterministic.

## Tool result contract

Tool responses should be structured:

```ts
{
  success: boolean;
  status: "completed" | "needs_approval" | "denied" | "failed";
  data?: unknown;
  userMessage: string;
  actionId?: string;
}
```

The model may verbalize `userMessage`, but it must not fabricate success.

## Action policy

Example:

```text
"Add milk to groceries"
    -> validate
    -> permission
    -> autonomy
    -> executor
    -> success
    -> voice confirmation

"Pay electricity bill"
    -> validate
    -> payment permission
    -> step-up authentication
    -> explicit approval
    -> executor
```

## Conversation references

Support:

- "that"
- "it"
- "the first one"
- "the older one"
- "same as yesterday"

Resolution must use HomeTalk conversation state plus authoritative domain data.

Never allow Gemini's conversation transcript to become household truth.

## Voice UX

Default responses should be short.

Examples:

User:
> "What's for dinner?"

Assistant:
> "Dinner is dal, rice and mixed vegetables."

User:
> "Add milk."

Assistant:
> "Added milk to the grocery list."

If ambiguity:

> "Which child do you mean, Asmi or Manan?"

If approval:

> "The electricity bill is ready to pay. Do you want me to proceed?"

If failure:

> "I couldn't add that right now. Nothing was changed."

## Interruptions

Support natural voice interruption where the Gemini Live API supports it.

When interrupted:

- cancel/reconcile pending conversational output
- do not accidentally cancel a committed domain action
- committed action state remains authoritative

## Audio/privacy

Do not persist raw audio by default.

If audio retention is introduced later:

- explicit policy
- purpose limitation
- retention period
- deletion mechanism
- access control
- audit

## Gemini-specific failure handling

If Gemini Live is unavailable:

- do not bypass HomeTalk
- do not execute actions directly
- show/reply with a safe failure
- allow another WonderHome channel to continue

## Tests

Include:

### Conversation
- simple household question
- multi-turn question
- correction
- ambiguous child
- relative date
- stale conversation reference

### Actions
- grocery add
- reminder creation
- approval-required action
- denied action
- executor failure
- duplicate action

### Security
- unlinked Google/Gemini identity
- wrong household
- revoked identity
- unauthorized health query
- unauthorized child query
- prompt injection through household data
- tool injection attempt

### Voice
- interruption
- reconnect
- timeout
- provider failure
- duplicate event
- partial response

## Acceptance criteria

- [ ] Gemini Voice uses HomeTalk.
- [ ] Gemini cannot directly access Supabase.
- [ ] Gemini cannot bypass authorization/autonomy.
- [ ] Gemini tools are allowlisted and domain-specific.
- [ ] Actual executor result determines completion.
- [ ] Multi-turn voice works.
- [ ] Identity is linked to a WonderHome member.
- [ ] Tests pass.
