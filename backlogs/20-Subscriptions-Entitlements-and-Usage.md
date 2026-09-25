# WonderHome — Subscriptions, Entitlements & Usage

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 20-001 | Plan model | Done | free/pro/max seeded as data; changing a plan is a migration |
| 2 | P0 | 20-002 | Entitlements | Done | one server-side entitlement service; hiding a feature is never the control |
| 3 | P0 | 20-003 | Usage metering | Done | atomic counters proven against 20 concurrent sessions |
| 4 | P0 | 20-004 | Upgrade/downgrade | Done | A change writes one row and never a household record; consequences shown and re-derived before applying; audited |
| 5 | P1 | 20-005 | Usage UI | Done | Settings shows used/limit per metered feature, from the same counter `consume` enforces against |
| 6 | P1 | 20-006 | Billing abstraction | Done | Provider-neutral `BillingProvider` port + pure `applyBillingEvent` (out-of-order and other-subscription events ignored, cancellation falls back to free, never deletes); Stripe adapter code-complete and inert (intent id as Idempotency-Key, HMAC-verified webhooks); `billing_intents` (one open per household+plan) and `billing_events` (unique per provider event) with RLS; `plans.requires_payment` keeps paid plans out of reach of any household session |
| 7 | P2 | 20-007 | Quota automation | Done | Burst (N per fixed W-second window) and fair-use (past N in the period, served more simply, never refused) as plan data on `plan_features`, enforced in the one entitlement service (`consume`); HomeTalk answers from the rules past fair use, with a disclosure, and refuses a burst as temporary; staff set policies through `PATCH /platform-admin/plans/{planKey}/policies` (`subscription.manage`, reason code), every change kept in `plan_policy_events` |
| 8 | P2 | 20-008 | Plan experiments | Done | `entitlement_experiments`: one feature changed (on, off, or a different allowance) for a stable hashed share of the households on named plans, applied inside `loadSubscription` so `may`/`consume` and every screen agree and a direct API call cannot bypass it; terms frozen once running and draft → running → stopped only (database trigger); a household reads only a running experiment's terms (column grants), never staff's description; staff create/start/stop through `/platform-admin/experiments` (`subscription.manage`, reason code, `entitlement_experiment_events`) and read per-group household counts and usage — counts only; Settings tells a household plainly when a feature is part of a trial |
| 9 | P1 | 20-009 | Multi-provider payments backend | Done | Razorpay (India) and Stripe (international) behind the one `BillingProvider` port, chosen per checkout by `selectPaymentProvider` (INR or an Indian household → the India provider, anything else → the international one, a preference honoured only where eligible, both defaults deployment config); our own price catalogue in major units (`plan_prices`, readable when active) mapped server-side to provider plans (`payment_provider_plans`, service role only); a ledger of what providers report (`payments` forward-only, `billing_invoices`, `payment_refunds` pending until the provider confirms, `payment_customers`), Admin-read and server-written; the subscription learns provider, interval, currency, amount, cancel-at-period-end and a scheduled downgrade; per-provider webhooks at `/api/v1/billing/webhook/{provider}`, HMAC-verified and applied once; a refund's household comes from our ledger, never the payload. Inert until a person prices the plans and sets a provider's keys |
| 10 | P1 | 20-010 | Plan, checkout and billing screens | Done | Prices decided and seeded (Pro ₹299/month, Max ₹599/month, a year at 20% off: ₹2,870 and ₹5,750); `/settings/plan` shows the current plan with its real terms (renewal date, ends-with-period, payment due), a Monthly/Yearly toggle, every plan's catalogue price with the yearly arithmetic, and "Free during early access" while no plan requires payment — switching stays free until a person marks the plans paid once a provider is live; a checkout summary (`/settings/plan/checkout`: plan, price, includes, region and currency, the provider the router chose and how it takes payment) that says honestly when payments aren't open; a confirmation page that waits for the provider's webhook instead of assuming; billing history with the last payment method (closed word, last four at most) and invoice detail linking to the provider's own copy; cancel at the end of the period, provider first; the landing page shows the same catalogue prices |
| 11 | P2 | 20-011 | Payment operations | Done | A payment that succeeds or fails, and a refund that completes, reaches one Admin (who started the checkout, else the head) as a notification whose source is the ledger row (`billing/notices.ts`, sent from `recordBillingEvent`; stored English only). Staff: `GET /platform-admin/payments` (counts by status, provider and currency, failures, refunds, reconciliation) and `POST /platform-admin/payments/{id}/refund` with a reason code (pending until the provider confirms; the refund row id is the idempotency key; audited `payment.refund_requested`), behind `payments.read`/`payments.refund` (operator, owner). Reconciliation (`billing/reconcile.ts`, nightly in the retention sweep and `POST /platform-admin/payments/reconcile`) reads recent payments back through each provider's `fetchPayment` and records differences in closed words in service-only `billing_reconciliation_runs`/`_findings`; it never corrects the ledger. Inert until a provider is live |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Subscriptions, Entitlements & Usage as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 20-E01 — Plans, Entitlements & Metering:** stories 20-001 through 20-004.
- **Epic 20-E05 — Billing, Quotas & Experiments:** stories 20-005 through 20-008.
- **Epic 20-E06 — Payments (Razorpay + Stripe):** stories 20-009 through 20-011.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 20-001 — Plan model
**Epic:** Plans, Entitlements & Metering
**Priority:** P0
**Goal:** Implement Free, Pro and Max as configurable plans.

**Acceptance criteria**
- Given the household state described by the story, implement Free, Pro and Max as configurable plans .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-002 — Entitlements
**Epic:** Plans, Entitlements & Metering
**Priority:** P0
**Goal:** Expose server-side feature checks.

**Acceptance criteria**
- Given the household state described by the story, expose server-side feature checks .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-003 — Usage metering
**Epic:** Plans, Entitlements & Metering
**Priority:** P0
**Goal:** Track AI/feature usage by period.

**Acceptance criteria**
- Given the household state described by the story, track AI/feature usage by period .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-004 — Upgrade/downgrade
**Epic:** Plans, Entitlements & Metering
**Priority:** P0
**Goal:** Change plans without data loss.

**Acceptance criteria**
- Given the household state described by the story, change plans without data loss .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-005 — Usage UI
**Epic:** Billing, Quotas & Experiments
**Priority:** P1
**Goal:** Show relevant usage and limits.

**Acceptance criteria**
- Given the household state described by the story, show relevant usage and limits .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-006 — Billing abstraction
**Epic:** Billing, Quotas & Experiments
**Priority:** P1
**Goal:** Provider-neutral subscription interfaces.

**Acceptance criteria**
- Given the household state described by the story, provider-neutral subscription interfaces .
- A payment retry cannot create a second provider transaction for the same approved intent.
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-007 — Quota automation
**Epic:** Billing, Quotas & Experiments
**Priority:** P2
**Goal:** Support configurable fair-use and burst policies.

**Acceptance criteria**
- Given the household state described by the story, support configurable fair-use and burst policies .
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-008 — Plan experiments
**Epic:** Billing, Quotas & Experiments
**Priority:** P2
**Goal:** Support controlled entitlement experiments.

**Acceptance criteria**
- Given the household state described by the story, support controlled entitlement experiments .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-009 — Multi-provider payments backend
**Epic:** Payments (Razorpay + Stripe)
**Priority:** P1
**Goal:** Take payments through Razorpay in India and Stripe elsewhere without either becoming the source of truth.

**Acceptance criteria**
- Plans, prices, subscriptions and entitlements are WonderHome's; a provider only moves money, and its plan or price id is configuration mapped server-side, never chosen by the browser.
- The provider for a checkout is chosen by a configurable router (currency and region, with a preference honoured only where eligible), and a missing or half-configured provider is never offered.
- Every amount is stored and shown in major units; minor units exist only inside a provider adapter.
- A webhook is believed only after its signature verifies over the raw body, and each provider event is applied once.
- A payment only ever moves forward; a refund stays pending until the provider confirms it; a refund's household comes from our own ledger.
- Cancellation and downgrade take effect at the end of the paid period, and nothing is removed before then.
- The ledger holds no card number, no secret and no provider prose; Admins read it and only the server writes it.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-010 — Plan, checkout and billing screens
**Epic:** Payments (Razorpay + Stripe)
**Priority:** P1
**Goal:** Let an Admin choose, pay for, change and review the household's plan.

**Acceptance criteria**
- Choose plan with monthly and yearly prices from the catalogue, the yearly saving computed from the two real prices, never claimed.
- Checkout shows region, currency and the provider the router chose, and hands off to the provider's hosted page.
- Success, subscription overview, upgrade/downgrade (at period end), payment methods, billing history and invoice detail each keep the three states and work at 360px.
- No price is shown that the catalogue does not hold, and no paid plan is reachable without a verified payment.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-011 — Payment operations
**Epic:** Payments (Razorpay + Stripe)
**Priority:** P2
**Goal:** Tell people what happened to their money and let staff see and fix it.

**Acceptance criteria**
- A successful, failed or refunded payment reaches the right Admin as a notification sourced from the ledger.
- Platform staff see payments, failures and refunds across households, counts first, and start a refund with a reason code.
- A reconciliation job compares the ledger with each provider and records any difference in closed words.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.