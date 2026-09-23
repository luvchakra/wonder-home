# Provider-neutral billing (story 20-006 Done)

**Date:** 2026-09-24 · **Module:** 20 Subscriptions, Entitlements & Usage · **Story:** 20-006

## What was done

Before this story, a plan change (20-004) wrote `household_subscriptions`
directly: no billing, no provider and no idempotency. This story adds the
provider-neutral layer between a household and whoever takes its money,
without inventing a live provider.

- **The port** (`packages/core/src/billing/provider.ts`):
  - `BillingProvider` has `sells`, `createCheckout` and `readWebhook`, plus
    `live`.
  - There are five canonical `BillingEvent`s: activated, renewed, payment
    failed, payment recovered and cancelled.
  - `applyBillingEvent` is pure, and it is the only thing that moves a
    subscription in response to billing:
    - it ignores an event older than the last one applied (providers deliver
      out of order);
    - it ignores an event about another provider subscription (a stale
      checkout completing late);
    - a failed payment keeps the plan as `past_due`, and entitlements already
      pause metered work then;
    - a cancellation falls back to the free plan.

    It never touches a household's records.
- **Stripe** (`packages/core/src/billing/stripe.ts`). Code-complete and
  inert, like the Resend and Alexa integrations.
  - Checkout sessions are created with our intent id as the
    `Idempotency-Key`, and the household and plan are carried in the
    subscription metadata.
  - Webhooks are verified with HMAC-SHA256 over `t.rawBody`, within a
    5-minute window, compared in constant time.
  - Stripe's events map onto ours: `checkout.session.completed`,
    `invoice.paid` (renewal, or a recovery when `attempt_count > 1`; the
    first invoice is skipped), `invoice.payment_failed` and
    `customer.subscription.deleted`. Both the old and new places Stripe
    keeps subscription metadata are read.
  - `stripeFromEnv` needs the switch, both secrets and at least one
    `STRIPE_PRICE_<PLAN>`. A half-configured provider is not a provider.
- **Checkout and events** (`packages/core/src/billing/checkout.ts`).
  - `startCheckout` finds or opens the one open intent for the household and
    plan (a unique index makes a race lose cleanly). It reuses a still-open
    session without asking the provider again, and expires stale intents.
    Only the server attaches the provider's session.
  - `recordBillingEvent` inserts the event with `ignoreDuplicates`, so a
    redelivery is a no-op. It applies the reducer and upserts the
    subscription (including `last_billing_event_at`), completes the intent,
    audits `subscription.changed` with `source: "billing"`, and records a
    closed-word outcome.
- **Webhook**: `POST /api/v1/billing/webhook` via `billing/webhook.ts`.
  - 401, in the standard envelope, both when unconfigured and for a
    rejected signature, so the two cannot be told apart from outside. This
    is the same choice the email webhook makes, and CI's e2e check that
    every guarded route refuses an anonymous POST caught the first version,
    which answered 404.
  - 400 for a verified body that cannot be read, with nothing changed.
  - 200 otherwise, reporting whether the event was acted on or a duplicate.
- **Plan change.**
  - The plan route's preview now says `checkout` or `unavailable` for a paid
    plan.
  - POST to a paid plan opens a checkout and returns its URL, or answers 409
    "can't be bought here yet". `changePlan` refuses a paid plan too; only
    platform staff can grant one.
  - `PlanForm` says "Continue to payment" or explains that the plan can't be
    bought yet.
  - Settings says what is true on return from the provider: the plan changes
    when the payment is confirmed, not on the redirect.
- **Migration** `20260927120000_billing_intents_and_events.sql`, **applied
  live**:
  - `plans.requires_payment`, off for every plan. It is enforced in the
    `household_subscriptions` insert and update RLS, so no household session
    can put itself on a paid plan.
  - `household_subscriptions.last_billing_event_at`.
  - `billing_intents`: an Admin inserts it open, as themselves, with no
    provider fields. The server writes everything after that.
  - `billing_events`: server-written only, unique per provider event, and
    readable by the household's Admins.
- **OpenAPI** documents the webhook and the checkout response.

## Verified

- typecheck and lint are clean.
- Unit tests: 2518/2518. New: the reducer (8), Stripe (12: signature
  accept/tamper/wrong-secret/replay, event mapping including both metadata
  locations, one Idempotency-Key across retries, unsold plans, env gating)
  and the webhook (4: unconfigured 401, rejected signature 401 and changes nothing,
  apply then duplicate, unknown event ignored).
- `test:db`: 461/461, including 4 new billing tests in the entitlements
  suite:
  - an Admin cannot set a `requires_payment` plan, but the server can and the
    Admin can still step down;
  - intent insert rules for Admin, member, outsider, and forged provider
    fields;
  - a household session cannot complete its own intent;
  - one open intent per plan;
  - events are server-only, unique, and readable by Admins only.
- `npm run eval`: 46/46 with 0/14 unsafe.
- `npm run verify:live`: 163/163, including both new tables and both new
  columns.
- Browser QA at 360px and desktop with a QA household:
  - a direct Free → Pro change still previews as before;
  - with Max briefly marked `requires_payment` on the live catalogue (about
    three minutes, reverted and confirmed), the preview explained that it
    can't be bought yet and offered no confirm button;
  - a direct `POST` to the plan route got 409 and nothing changed;
  - `?checkout=cancelled` showed the "no payment was taken" notice;
  - no horizontal overflow.

## Needs a person

- A billing account (Stripe or another provider behind the same port),
  prices for each paid plan, and the pricing decision to mark those plans
  `requires_payment`. Until then plan changes work exactly as they did,
  directly.
- Registering the webhook endpoint with the provider and setting its secret
  on the deployment.
