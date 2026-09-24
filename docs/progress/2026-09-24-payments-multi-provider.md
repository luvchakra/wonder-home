# Payments across providers: Razorpay and Stripe behind one port (story 20-009)

**Date:** 2026-09-24
**Story:** 20-009 Multi-provider payments backend — Done. Screens are 20-010,
and payment operations are 20-011. Both are Not Started.
**Spec:** `Payment_Razorpay_Stripe_Integration_Master.md`, with the 12-screen
mockup (choose plan through invoice detail).

## What was done

WonderHome can now take money through Razorpay in India and Stripe everywhere
else. Neither provider becomes the source of truth. Plans, prices,
subscriptions and entitlements stay WonderHome's. A provider only moves money,
and everything it reports goes through a verified webhook, the pure
`applyBillingEvent` reducer and a ledger.

- **Price catalogue** (`plan_prices`, `billing/prices.ts`):
  - What each plan costs per interval (month or year) and currency, in major
    units (`numeric(12,2)`).
  - Readable by anyone signed in while the price is active.
  - One active price per plan, interval and currency.
  - `payment_provider_plans` maps a price to Razorpay's plan id or Stripe's
    price id. It has no policy, so only the service role can read it, and the
    browser never names or sees a provider id.
  - **Both tables ship empty.**
- **Router** (`billing/router.ts`): `selectPaymentProvider` picks a provider
  per checkout.
  - INR, or a household whose region is IN, goes to the India provider.
  - Anything else goes to the international provider.
  - A preference is honoured only where that provider is eligible.
  - `none_eligible` is an honest answer.
  - A provider is live only when it is listed in `WONDERHOME_BILLING_PROVIDERS`
    and fully configured. The older `WONDERHOME_BILLING_PROVIDER` still works.
- **Razorpay adapter** (`billing/razorpay.ts`):
  - A checkout is a server-created subscription on the mapped `plan_id`, with
    the household, plan, intent, interval and currency in its notes. Razorpay's
    hosted `short_url` is the checkout.
  - Webhooks are verified by hex HMAC-SHA256 of the raw body and keyed by
    `x-razorpay-event-id`.
  - Event mapping:
    - `activated` → activated.
    - The first `charged` → ledger only; later ones → renewed.
    - `pending` / `halted` → past due, never cancelled on the spot.
    - `cancelled` / `completed` → cancelled.
    - `payment.failed` → a recorded declined attempt.
    - `refund.processed` / `refund.failed` → refund events.
  - Cancelling uses `cancel_at_cycle_end`. Refunds carry a minor-unit amount
    and our refund id.
  - Error messages carry only the HTTP status, never Razorpay's prose.
- **Stripe adapter** (`billing/stripe.ts`):
  - It now takes the mapped price from the catalogue, with
    `STRIPE_PRICE_<PLAN>` as the legacy fallback.
  - It puts payments and invoices in the ledger.
  - It reads `customer.subscription.updated` as cancel-at-period-end.
  - It can refund with an Idempotency-Key and cancel at period end.
- **Money** (`billing/money.ts`): minor units exist only inside an adapter,
  converted by the currency's own exponent (JPY 0, KWD 3, most currencies 2),
  without float noise.
- **Ledger** (migration `20261003090000_payments_multi_provider.sql`):
  - `payments`:
    - once per provider id;
    - status only ever moves forward (`billing/states.ts`);
    - `failure_code` is the provider's code, never its prose;
    - `method` is a closed word, and `method_last4` holds four digits at most.
  - `billing_invoices`: https links only.
  - `payment_refunds`:
    - pending until the provider confirms;
    - `completed_at` is set exactly when the refund succeeded;
    - its household comes from our own `payments` row, never from the payload.
  - `payment_customers`.
  - Admins read every ledger table; only the server writes it.
- **Subscription terms**: `household_subscriptions` gains `provider`,
  `billing_interval`, `currency`, `amount`, `cancel_at_period_end` and
  `scheduled_plan_key`. `billing_intents` gains the price, interval and
  currency it was opened for.
  - Activation sets the terms. Cancellation clears them and falls back to free.
  - `subscription.cancel_scheduled` flips `cancel_at_period_end`, and the
    change is audited.
  - A renewal that names the scheduled plan applies the downgrade.
- **Webhook routes**: `POST /api/v1/billing/webhook/{provider}` for each
  provider. The bare `/api/v1/billing/webhook` stays Stripe's for
  compatibility. A refund for a payment we never recorded is answered
  `acted:false` and writes nothing.
- **Plan API**:
  - `GET /households/{id}/plan` reports a plan as sold when some live provider
    has a mapped price for it, and returns `purchasablePriceIds`.
  - `POST` takes `priceId` and an optional `preferredProvider`, and opens a
    routed checkout (`startPricedCheckout`) using the household's region and
    the signed-in member's email.

## Why

The spec requires a provider abstraction, a configurable router, our own
plans mapped to provider ids, full payment, refund, invoice and webhook
ledgers, server-authoritative state and period-end cancellation. It also
requires that there be no secrets in the browser and no invented prices. This
backend is the foundation the 12 screens will sit on.

## Verified

- Billing unit tests: 116 passed across 10 files. They cover:
  - `razorpay.test.ts`: signatures, the event vocabulary, calls in paise, and
    no prose kept on errors;
  - `router.test.ts`: routing, money and forward-only payment states;
  - `ledger.test.ts`: a Razorpay subscription's whole life through the webhook
    into the ledger, including redelivery, out-of-order events, refunds adding
    up and an unknown refund;
  - `stripe.test.ts` and `provider.test.ts`, updated.
- Database suite `scripts/test-payments-rls.mjs`: 11 passed.
  - The catalogue ships empty.
  - Prices are readable, and provider plans are not.
  - The ledger is Admin-read and server-written, even for an Admin.
  - Payments are unique per provider id; only codes and last-four digits are
    kept.
  - Refunds stay pending until confirmed.
  - Intents carry their terms; the new event types and the `recorded` outcome
    are accepted.
- Typecheck, lint and migration lint are clean.
- The migration was applied to the live project with `apply_migration`
  (`payments_multi_provider`). `npm run verify:live`: 212/212 passed, including:
  - the six new tables and four new columns;
  - the purchasable-prices embed;
  - "nobody can read which provider plan backs a price";
  - "anonymous cannot record a payment".
- Supabase security advisor: the only new finding is the intended "RLS
  enabled, no policy" on `payment_provider_plans`.

## Still open / needs a person

- **Pricing.** What each plan costs, per interval and currency, and whether
  to mark plans `requires_payment`. This is a person's decision; nothing is
  priced, and the screens (20-010) wait on it.
- **Provider accounts.**
  - A Razorpay account: key id, key secret, webhook secret, and plans created
    in the Razorpay dashboard.
  - A Stripe account: secret key, webhook secret, and prices.
  - Webhook endpoints registered at `/api/v1/billing/webhook/razorpay` and
    `/api/v1/billing/webhook/stripe`.
  - `WONDERHOME_BILLING_PROVIDERS` set.
  - Rows inserted into `plan_prices` and `payment_provider_plans`.
- **20-011.** Payment notifications, platform-admin monitoring, staff refunds
  and reconciliation.

## Where the code lives

- `packages/core/src/billing/`: `razorpay.ts`, `router.ts`, `prices.ts`,
  `money.ts`, `states.ts`, `signature.ts`, `provider.ts`, `stripe.ts`,
  `checkout.ts` and `webhook.ts`, with their tests.
- `apps/web/app/api/v1/billing/webhook/[provider]/route.ts`
- `apps/web/app/api/v1/households/[householdId]/plan/route.ts`
- `supabase/migrations/20261003090000_payments_multi_provider.sql`
- `scripts/test-payments-rls.mjs`
- `scripts/verify-live-project.mjs`

## Cleanup

No QA accounts, households, rows or files were created. Database tests ran
against throwaway local databases, and the live checks write nothing.
