# WonderHome — Supabase Database Specification

## Stack alignment
Use Supabase PostgreSQL as used by the WonderArk core architecture, with `@supabase/ssr` for server-side session-aware access and `@supabase/supabase-js` for database operations. Keep migrations in source control under `supabase/migrations/`.

## Principles
- Every household-owned table contains `household_id` and has RLS enabled.
- Application authorization is required in addition to RLS.
- UUID primary keys; timestamps on mutable entities.
- Foreign keys and common query filters are indexed.
- JSONB is for extensible metadata, not core authorization or ownership fields.
- Service-role credentials are server-only.
- Never edit an applied migration; create a new migration.

## Core identity
- `profiles`: id, display_name, avatar_url, timezone, timestamps
- `households`: id, name, timezone, owner_member_id, status, timestamps
- `household_members`: id, household_id, profile_id, member_type, display_name, date_of_birth, status
- `household_roles`: household_id, member_id, role
- `member_permissions`: member_id, permission, scope_jsonb
- `member_availability`: member_id, day_of_week, start_time, end_time, source

## Operating model
- `responsibilities`: outcome_type/key, primary_member_id, backup_member_id, ai_mode, priority
- `playbook_items`: name, outcome_definition, cadence, window, dependencies, verification, escalation
- `routines`: playbook_item_id, schedule, next_due_at, active
- `outcomes`: playbook_item_id, status, due_at, owner_member_id, risk_level, state
- `policies`: category, name, rule_jsonb, version, active
- `memories`: scope, category, key, value_jsonb, source_type/id, confidence, status

## Conversation & AI
- `conversation_sessions`
- `conversation_messages`
- `conversation_actions` (with `approval_fingerprint`: an approval binds to the exact proposal, Wave 5 §20). `rejected` and `expired` are terminal: a trigger refuses any later change of `approval_status`, so a turned-down proposal can never be executed (test spec AG-005)
- `external_voice_identities`: an Alexa or Gemini Voice account linked to one member, with the scopes they chose; readable by that member and the household's admins, created by the server after consent, revoked only through `public.revoke_voice_identity` (voice phase 2)
- `voice_oauth_grants`: OAuth codes and access/refresh tokens WonderHome issued to a voice provider, stored only as SHA-256 hashes; no session can read it
- `ai_corrections`: append-only correction evidence, one row per corrected field, admin-readable, server-written (Wave 5 §13)
- `agent_runs`
- `approvals`
- `audit_events`

## Certification
- `certification_items`
- `certification_reviews`

## Notifications
- `notifications`
- `notification_preferences`
- `notification_events`

## Domain tables
Create normalized household-scoped tables for helper profiles/availability, school connections/assignments/documents/exams, groceries/inventory/orders, meals/recipes, bills/payment intents, pets/care outcomes, maintenance/assets/work orders, family-time events, social events/invitations/RSVPs/gifts.

### Helper operations (module 07)
- `helper_profiles`, `member_availability`, `availability_exceptions`

Availability is split into a recurring pattern and dated exceptions. An absence
is a row in `availability_exceptions`, never an edit to the pattern, because the
pattern is what tells us the absence is unusual.

### Home, maintenance & pets (module 13)
- `home_assets`: category, location, service_interval_days, last_serviced_on,
  warranty/AMC expiry, responsible_member_id, status
- `asset_service_events`: what was actually done, when, by whom and at what cost
- `service_requests`: provider, status, scheduled_for, `next_action`, `next_action_by`
- `laundry_needs`: label, needed_by, inferred state with `state_as_of`/`state_source`
- `pets`, `pet_care_needs`: kind, interval or date, responsible member, supply days
- `home_device_signals`: optional readings — kind, observed_at, value, confidence

Three deliberate absences carry the module's product rules. There is no
completion or chore table, because nobody is asked to keep WonderHome accurate.
`laundry_needs` has no wash/dry/fold step to tick: state advances from
observation, and `unknown` is both the default and the honest common case.
`home_device_signals` has **no insert policy for members** — readings are
server-ingested, because evidence a member can write is not evidence.

`next_action_by` is the column that makes an open service request actionable
rather than informational, and a settled request is constrained to hold none.

## Reliability (Wave 5 §14–§16)
- `rate_limit_counters`: fixed-window counters (bucket, subject, window start, hits). Not a tenant table. Deny-all RLS; only the server reaches it, through the service-role-only `public.rate_limit_hit`. Swept daily after a day.
- `homesend_email_events`: forwarded-email telemetry in closed words only (a kind, an optional latency and count, the household). Nothing from an email is ever stored here. Deny-all RLS, platform-read through the admin client, swept after 90 days.
- `jobs` is reached by the server through `public.claim_jobs` / `public.complete_job` (service role only). HomeSend's classification retries run there, one waiting job per item.
- `idempotency_keys`: a request reserves its key while it is in flight (status 102, two-minute expiry). Members may complete or release their own household's reservation.

## Integrations
- `integrations`: provider, status, scopes, credential reference, last sync
- `integration_events`: provider event identity, type, payload hash, processing timestamps

## Plans & platform admin
- `plans`, `entitlements`, `household_subscriptions`, `usage_counters`
- `platform_admins`, `support_access_grants`

## RLS strategy
Implement helper functions for authenticated member and household scope. Every tenant table must have SELECT/INSERT/UPDATE/DELETE policies based on membership and explicit permission. Test cross-household access, adult-private access, child boundaries and helper boundaries.

## Data lifecycle
Define retention per data class. Privacy deletion must actually remove or anonymize records according to policy. Audit records may have a longer retention period but must remain privacy-minimized.
