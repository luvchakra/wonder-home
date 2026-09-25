# Payment operations (story 20-011)

**Date:** 2026-09-25

## What was done
- **Notices from the ledger.** `billing/notices.ts` sends a notice when the
  ledger records one of these moves (never a redelivery):
  - a payment moving to `succeeded` or `failed`;
  - a refund moving to `succeeded`.

  `recordLedger` returns those moves and `recordBillingEvent` sends them,
  after the event is recorded; a failed send never fails the webhook.

  One Admin receives each notice: whoever started the checkout, while still
  an Admin, otherwise the head. The notification's `source_type` is
  `payment` or `payment_refund` and its `source_id` is the ledger row. The
  wording is plain and never contains a card detail or provider prose. A
  failure says "Nothing was taken".
- **Staff monitoring and refunds** (`platform/payments.ts`), behind
  `payments.read` and `payments.refund` (operator and owner; support has
  neither).
  - `GET /platform-admin/payments` returns counts by status, provider and
    currency. It never adds amounts across currencies. It also returns recent
    failures and refunds, each provider's last reconciliation run, and open
    findings.
  - `POST /platform-admin/payments/{id}/refund` takes a reason code and an
    optional amount in major units, and refunds only what is left.
    - The refund stays `processing` until the provider's own event confirms it.
    - The refund row's id is the provider's idempotency key.
    - If the provider refuses, the refund is marked `failed` and the request
      returns 409.
    - Each refund is audited as `payment.refund_requested`.
- **Reconciliation** (`billing/reconcile.ts`).
  - A new optional `fetchPayment` exists on the provider contract, with
    Razorpay (payments API) and Stripe (PaymentIntent plus latest charge)
    implementations.
  - Each pass compares the last 35 days of the ledger (at most 200 payments)
    and records `missing_at_provider`, `status_mismatch`, `amount_mismatch` or
    `currency_mismatch`, one open finding per payment and kind.
  - A finding closes when the payment agrees again.
  - Two in-flight states are timing, not a difference.
  - An outage is counted as `unreachable`, never recorded as a finding.
  - It never corrects the ledger.
  - It runs nightly inside the retention sweep (no new cron entry) and on
    demand via `POST /platform-admin/payments/reconcile`. A provider that is
    not configured is `skipped_not_configured`.
- **Migration** `20261007090000_payment_operations`:
  - notification source types `payment` and `payment_refund`;
  - the service-only `billing_reconciliation_runs` and
    `billing_reconciliation_findings` tables (RLS on, no grants to anon or
    authenticated).

  It was applied live, and `verify:live` passed 221/221.

## Verified
- Unit tests:
  - reconciliation comparison and both providers' mappings;
  - skipped when not configured, with no database touched;
  - notice transitions and wording;
  - the refundable amount;
  - support staff refused before anything is read;
  - the existing ledger suite.
- The payments DB suite, 12 tests: households cannot read or write
  reconciliation tables, closed words are enforced, and a payment notice is
  visible to its Admin only. Migration lint, OpenAPI test, typecheck and lint
  also pass.
- Live: a payment and its notice were seeded on a QA household, and the Admin
  sees "Payment received" on `/notifications` at 360px.

## Still open / needs a person
- Everything is inert until Razorpay or Stripe is live: keys, webhook secret,
  and plan mapping.
- Payment notices are stored in English only, like health notices; a
  `reminder.*`-style catalog message is a follow-up.
- There is no rendered staff dashboard; it is JSON endpoints only, like the
  other platform-admin capabilities.
