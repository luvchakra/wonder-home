# Razorpay subscriptions, end to end (story 20-009 follow-up)

Owner, 2026-11-20: "add razorpay payment for subscription, tell me action pending on me".

## Gap list (what existed vs. Razorpay Subscriptions)
| Area | Before | Now |
| --- | --- | --- |
| Plan creation / mapping | `payment_provider_plans` existed but nothing wrote it: a person would have had to create plans in Razorpay and insert ids by SQL | Platform admin → Plans & billing → **Payment provider plans**: "Create in Razorpay" (from our price, `POST /v1/plans`) or "Link an existing plan" (read back, linked only if amount, currency and interval match). `billing/provider-plans.ts`, `POST /api/v1/platform-admin/prices/{priceId}/link`, owner only, audited `platform.price_linked` |
| Marking a plan paid | No control; `plans.requires_payment` only by SQL | Plan editor "Members pay for this plan", refused until every active price is linked to a live provider (`plan-edit.ts`) |
| Checkout | Razorpay's hosted `short_url`, which never returns to WonderHome | Razorpay Checkout opens in place with the subscription id and publishable key id; the success handler goes to `/settings/plan/confirmed`, which waits for the webhook; `short_url` stays as the fallback. CSP allows exactly Razorpay's script, frame and API hosts |
| Webhooks | activated, charged, pending, halted, cancelled, completed, payment.failed, refunds — all through `applyBillingEvent` | Unchanged mapping; each charge now also writes its receipt line (`billing_invoices` from the payment's `invoice_id`) |
| Invoices / receipts view | Empty for Razorpay (only Stripe sent invoices) | Every Razorpay charge appears with its invoice under Billing |
| Cancel at period end | Built (`cancel_at_cycle_end: 1`, local flag, provider's later `subscription.cancelled` moves to Free) | Unchanged |
| Past-due and retry | pending/halted → past_due, plan kept; next charge → active | Unchanged; documented for households in help and on /legal |
| Second subscription | A paid household could open another checkout: two live subscriptions would both charge | Refused while the current one still renews (`assertNoRenewingSubscription`) |
| Reconciliation | `billing/reconcile.ts` compares ledger payments with `fetchPayment` | Unchanged (Razorpay's `fetchPayment` now shares the adapter's read helper) |
| Policy pages for activation | /legal had no payment, cancellation or refund wording and said "No payment provider is configured" | /legal#payments (prices, how you pay, cancelling, failed payments, refunds) and /legal#contact. Full Terms and Privacy Policy remain the owner's to write |

## Verified
- Unit: `npx vitest run packages/core/src/billing/ packages/core/src/security/headers.test.ts` — 17 files, 163 tests (new: plan create/read/match, invoice per charge, checkout client, owner-only link, paid-plan refusal, the one-subscription guard), plus sensitive-actions, csrf, audit, openapi and platform-admin tests (190) and help (77).
- `npm run typecheck`, ESLint on the changed web files, `lint:help-links`, input-boundary inventory regenerated.
- Razorpay test mode: **not run** — no test keys exist yet. The adapter is exercised through its fetch mock and contract tests.

## No migration
Every table and column used already exists (`payment_provider_plans`, `plans.requires_payment`, `billing_invoices`).

## Open / needs the owner
`docs/billing/razorpay-owner-setup.md`: activate the Razorpay account (KYC; full Terms and Privacy Policy still to be written and approved; confirm the refund wording on /legal#payments; contact phone and address), test keys into Configuration/Secrets, webhook + `RAZORPAY_WEBHOOK_SECRET` in Vercel, Payment providers → Razorpay, Create in Razorpay per price, mark plans paid, test trial, then live keys.

## Where
`packages/core/src/billing/{razorpay,provider,provider-plans,checkout,plan-edit}.ts`, `apps/web/app/_components/checkout-button.tsx`, `apps/web/app/platform-admin/plans/{page,plan-editor,price-links}.tsx`, `apps/web/app/api/v1/platform-admin/prices/[priceId]/link/route.ts`, `packages/core/src/security/headers.ts`, `apps/web/app/legal/page.tsx`, help words (8 languages), `docs/external-providers.md`.
