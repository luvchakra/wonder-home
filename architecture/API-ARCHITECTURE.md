# WonderHome — API Architecture & Contract

## Canonical contract
All business capabilities are exposed under `/api/v1`. The Next.js web UI and governed AI tools are clients of these APIs. Business-critical logic must not exist only inside React components.

## Resource families
`/households`, `/members`, `/roles`, `/responsibilities`, `/playbooks`, `/routines`, `/outcomes`, `/availability`, `/calendar/events`, `/conversation/sessions`, `/conversation/messages`, `/conversation/actions`, `/certification`, `/certification/items`, `/notifications`, `/notification-preferences`, `/househelper`, `/school`, `/kids`, `/homework`, `/exams`, `/groceries`, `/inventory`, `/orders`, `/commerce`, `/meals`, `/bills`, `/payments`, `/pets`, `/maintenance`, `/laundry`, `/family-time`, `/social`, `/agents`, `/agent-runs`, `/approvals`, `/actions`, `/integrations`, `/webhooks`, `/subscription`, `/entitlements`, `/usage`, `/privacy`, `/audit`, `/platform-admin/*`.

## Required contract per endpoint
- authenticated actor
- household/member scope
- role/permission requirement
- request validation using Zod or equivalent shared schema
- typed response schema
- standard error envelope
- idempotency for side effects
- audit behavior where relevant
- OpenAPI documentation
- rate/abuse controls where appropriate

## Error envelope
`{ error: { code, message, details?, requestId } }`

Do not expose stack traces, secrets, provider tokens, raw model prompts or unnecessary household content.

## AI tool contract
AI tools call application services. Each tool invocation must independently validate the authenticated member, household scope, role/permission, entitlement, autonomy policy and action payload. An LLM response is never authorization.

## Eventing
Use versioned, scoped, replay-safe domain events for notifications, learning, integrations and asynchronous work. Events should contain references rather than unnecessary sensitive payloads.

## API performance
Core APIs target p95 <= 500 ms for reads and <= 800 ms for ordinary mutations, excluding external provider latency. Long-running AI/integration operations must use asynchronous jobs.
