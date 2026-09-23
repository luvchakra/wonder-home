# WonderHome — External Voice Identity, Account Linking and Authorization

## Purpose

Implement the identity and account-linking foundation required for external voice assistants.

Run this **after `01-hometalk-voice-gateway-foundation.md`**.

This phase must support both:

- Gemini Voice
- Alexa

without creating provider-specific household authorization models.

## Architecture

```text
External Voice Provider
        |
        v
Provider identity
        |
        v
WonderHome account linking
        |
        v
WonderHome user/member
        |
        v
Household
        |
        v
Scoped permissions + autonomy
```

## Important rule

A Google/Gemini identity or Amazon/Alexa identity does NOT automatically equal:

- the household
- the Admin
- the current speaker
- permission to access every family member

Explicitly link the external identity to WonderHome.

## Data model

Inspect the current schema first.

If an equivalent table/model does not exist, create a model conceptually equivalent to:

```text
external_voice_identity
-----------------------
id
household_id
member_id
provider
provider_subject
provider_account_id
device_id nullable
device_name nullable
status
scopes
linked_at
last_used_at
revoked_at nullable
created_at
updated_at
```

Use canonical household/member IDs.

Do not create a second person/member model.

## Provider enum

Support at minimum:

```text
gemini
amazon_alexa
```

Keep it extensible.

## Token handling

Never store provider access tokens in ordinary application tables as plaintext.

Use the project's existing secure secret/token mechanism.

If a provider requires refresh tokens:

- encrypt at rest
- restrict access
- rotate/revoke safely
- never expose to browser code
- never pass them to the model

## Linking UX

WonderHome should provide:

```text
Settings
  -> Integrations
     -> Voice Assistants
        -> Gemini Voice
        -> Alexa
```

Each provider should show:

- Not connected
- Connected to [member]
- Connected devices
- Permissions
- Revoke

## Permissions

Implement least privilege.

Possible scopes:

```text
household.read
calendar.read
meals.read
groceries.read
groceries.write
school.read
bills.read
health.read
health.write
home.read
home.write
pets.read
notifications.create
```

Do not expose sensitive scopes unless explicitly required.

Health and child-related information require additional policy checks.

## Child privacy

If a voice request concerns a child:

```text
request
 -> linked member
 -> household policy
 -> child privacy policy
 -> allowed scope
```

Do not infer that an adult household member's linked voice identity can expose every child-sensitive record.

## Alexa account linking

Alexa custom skills support OAuth 2.0 account linking. Amazon currently recommends authorization-code grant; PKCE is recommended for the authorization flow. The implementation should follow Amazon's current requirements rather than inventing a custom flow.

Reference:
https://developer.amazon.com/docs/alexaplus/account-linking/requirements-account-linking.html

Implement:

- OAuth authorization endpoint
- token endpoint as required
- authorization-code flow
- PKCE where supported/required
- secure token storage
- account-link status
- unlink/revoke

## Gemini identity

Do not assume that Gemini Live automatically provides a WonderHome household identity.

The Gemini Voice client/integration must authenticate to WonderHome and obtain a WonderHome session/access context.

Use the existing WonderHome auth system where possible.

The model/API credential is NOT the user's WonderHome identity.

## Session binding

Every voice session must be bound to:

```text
WonderHome account
household
member
provider
device/session
```

Do not allow the model to select a household or member.

## Authorization checks

Before HomeTalk accesses context:

1. validate external identity
2. resolve WonderHome member
3. resolve household
4. verify membership
5. verify requested data scope
6. retrieve permitted context

Before action:

1. validate intent
2. resolve entity
3. validate domain
4. validate household scope
5. entitlement
6. permission
7. autonomy
8. approval
9. execute

## Revocation

Revoking a provider must immediately prevent:

- context retrieval
- actions
- notifications through that provider

Existing household data must not be deleted by unlinking the provider.

## Security tests

Test:

- valid linked identity
- invalid token
- expired token
- revoked identity
- wrong household
- wrong member
- child privacy denial
- health privacy denial
- scope denial
- replay attempt
- token leakage
- browser cannot access provider secrets
- provider cannot bypass HomeTalk

## Acceptance criteria

- [ ] External identity is separate from WonderHome identity.
- [ ] Household/member resolution is deterministic.
- [ ] Provider credentials are protected.
- [ ] Revocation works.
- [ ] Least privilege is enforced.
- [ ] Alexa OAuth account linking is ready for adapter implementation.
- [ ] Gemini Voice can obtain a valid WonderHome session.
- [ ] Tests pass.

## Completion marker

Before Phase 3, document:

- exact schema changes
- auth endpoints
- token storage mechanism
- provider linking states
- test results
