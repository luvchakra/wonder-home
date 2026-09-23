# WonderHome — Unified Voice UX and Capability Matrix

## Purpose

Unify HomeTalk behavior across:

- WonderHome Web
- WonderHome Mobile/PWA
- Gemini Voice
- Alexa

Run after the provider integrations are working.

## Core principle

> One household. One context. One conversation/action engine.

Voice providers are channels, not separate products.

## Capability matrix

| Capability | Web/Mobile | Gemini Voice | Alexa |
|---|---:|---:|---:|
| Household questions | Yes | Yes | Yes |
| Today's agenda | Yes | Yes | Yes |
| Meals | Yes | Yes | Yes |
| Groceries read | Yes | Yes | Yes |
| Groceries write | Yes | Yes | Yes |
| Calendar read | Yes | Yes | Yes |
| Reminder creation | Yes | Yes | Yes |
| School information | Yes | Policy-controlled | Policy-controlled |
| Health information | Yes | Policy-controlled | Policy-controlled |
| Financial status | Yes | Policy-controlled | Policy-controlled |
| Payment execution | Yes | Step-up + approval | Step-up + approval |
| Admin/security changes | Yes | Restricted | Restricted |
| Household context | Full permitted | Full permitted | Full permitted |
| Interactive long conversation | Yes | Yes | Session-dependent |

Treat this matrix as a product-policy starting point, not a bypass around authorization.

## Voice command categories

### Informational

Examples:

- "What's happening tomorrow?"
- "What's for dinner?"
- "What bills are due?"

No mutation.

### Retrieval with references

Examples:

- "What about the one we discussed yesterday?"
- "What's the older bill?"

Resolve against authoritative household data.

### Low-risk actions

Examples:

- "Add bananas to groceries."
- "Create a reminder."

Run through autonomy policy.

### Sensitive actions

Examples:

- "Pay the electricity bill."
- "Delete the medical appointment."
- "Change the household admin."

Require appropriate step-up authentication/approval.

## Clarification strategy

Ask a question only when ambiguity materially affects correctness.

Good:

> "Do you mean Asmi or Manan?"

Bad:

> "Could you please clarify the context of your request?"

Make clarification specific and actionable.

## Cross-channel continuity

A conversation started in Gemini should not automatically be assumed to continue in Alexa.

Household truth is shared.

Conversation state may be channel/session-specific unless explicitly persisted.

Example:

Gemini:
> "I found two milk entries."

Later Alexa:
> "Which one?"

Alexa should not guess that it refers to the Gemini conversation unless a shared conversation context was explicitly established.

## Notifications

Voice assistants may produce spoken responses, but WonderHome remains the source of truth for notifications.

Do not duplicate notifications merely because multiple providers are connected.

## HomeTalk response styles

Implement response intent:

```text
answer
clarify
confirm
approval
completed
failed
not_authorized
```

Provider adapters render these into channel-specific responses.

## Acceptance criteria

- [ ] Same underlying intent model across channels.
- [ ] Same authorization.
- [ ] Same autonomy.
- [ ] Same domain executors.
- [ ] Provider-specific rendering only at the edge.
- [ ] Voice responses are concise.
- [ ] Sensitive domains remain protected.
