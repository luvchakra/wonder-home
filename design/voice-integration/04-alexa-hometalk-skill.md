# WonderHome — Alexa HomeTalk Skill Integration

## Purpose

Implement Alexa as another voice interface to HomeTalk.

Run this **after Phases 1–3**.

Alexa must not create a second WonderHome conversational architecture.

## Architecture

```text
Alexa
  |
  v
WonderHome Custom Skill
  |
  v
Alexa Adapter
  |
  v
HomeTalk Gateway
  |
  v
HomeBrain / Context
  |
  v
Governed Domain Tools
  |
  v
Domain Executors
```

## Current Amazon requirements

Amazon's current Alexa documentation states that custom skills can use account linking and that OAuth 2.0 authorization-code grant is recommended. PKCE is recommended for the authorization-code flow.

Official references:

https://developer.amazon.com/docs/alexaplus/account-linking/requirements-account-linking.html

https://developer.amazon.com/docs/alexaplus/account-linking/implement-auth-flow.html

https://developer.amazon.com/docs/alexaplus/account-linking/configure-authorization-code-grant.html

Before implementation, verify current Alexa certification/security requirements.

## Skill invocation

Design a simple invocation such as:

> "Alexa, ask WonderHome..."

Support natural follow-up conversation inside the skill session where practical.

Do not require users to memorize complex commands.

## Intents

Start with a small set:

```text
WonderHomeQueryIntent
WonderHomeActionIntent
WonderHomeClarificationIntent
HelpIntent
CancelIntent
StopIntent
```

The exact Alexa interaction model should map to the HomeTalk request contract rather than duplicate domain intent definitions.

## Example

User:

> "Alexa, ask WonderHome what's happening tomorrow."

Alexa:

```text
Alexa request
  -> verify Alexa request
  -> resolve linked WonderHome account
  -> HomeTalk
  -> HomeBrain
  -> response
```

## Account linking

Use WonderHome's OAuth account-linking infrastructure from Phase 2.

Do not create an Alexa-only user table.

Flow:

```text
Alexa account
    |
OAuth account linking
    |
WonderHome identity
    |
household/member
```

Amazon supports account linking for connecting an Alexa identity to a user's account in another system.

## Alexa request verification

Validate Alexa requests according to Amazon's current security requirements, including request signature/certificate verification where required.

Do not accept arbitrary requests that merely resemble Alexa payloads.

Official security reference:
https://developer.amazon.com/en-US/docs/alexa/custom-skills/security-testing-for-an-alexa-skill.html

## Permissions

Alexa receives only the minimum information required for the current request.

Examples:

Allowed:
- dinner status
- grocery list
- calendar summary

Potentially restricted:
- child school details
- health information
- financial/payment details
- security settings

## Voice response requirements

Alexa responses should be:

- short
- spoken naturally
- no markdown
- no URLs
- no internal IDs
- no database terminology
- no "click"
- no unsupported certainty

## Actions

Alexa may request actions such as:

```text
add grocery
create reminder
mark routine complete
get meal status
```

All actions go through the same governance pipeline.

Alexa must never directly execute a DB mutation.

## Account linking failure

If linking is missing:

> "Please link your WonderHome account before I can access your household."

Use the appropriate Alexa account-linking response/card required by the current Alexa platform.

## Session handling

Map:

```text
Alexa request/session
    -> HomeTalk session
```

But do not treat an Alexa session as permanent household state.

## Tests

### Security
- invalid signature
- malformed request
- missing token
- expired token
- revoked account
- wrong household
- wrong member

### Functional
- household question
- grocery action
- reminder
- clarification
- cancel
- stop
- account linking

### Reliability
- duplicate request
- timeout
- HomeTalk failure
- domain executor failure
- provider retry

## Acceptance criteria

- [ ] Alexa custom skill calls only HomeTalk.
- [ ] Account linking uses secure OAuth.
- [ ] Alexa request verification is implemented.
- [ ] No direct database access.
- [ ] Actions use deterministic executors.
- [ ] Existing WonderHome autonomy rules remain authoritative.
- [ ] Tests pass.
- [ ] Alexa certification/security requirements are checked against current Amazon documentation.
