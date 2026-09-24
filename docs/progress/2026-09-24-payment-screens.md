# Payments, part 2: plan, checkout and billing screens (story 20-010)

**Date:** 2026-09-24
**Story:** 20-010 Plan, checkout and billing screens — Done. Payment
operations (notifications, staff refunds, reconciliation) are 20-011.
**Decided by the product owner:**
- Pro is ₹299 a month and Max ₹599 a month.
- A year is 20% off twelve months.
- Paid plans start requiring payment only once a payment provider is live.

## What was done

- **Prices.** `20261004090000_plan_prices_inr.sql` seeds the catalogue:
  - Pro ₹299 a month or ₹2,870 a year;
  - Max ₹599 a month or ₹5,750 a year.

  The yearly prices are 20% off twelve months (₹2,870.40 and ₹5,750.40),
  rounded down to whole rupees. It was applied live. No plan is marked
  `requires_payment`, and no provider plan is mapped.
- **Your plan** (`/settings/plan`).
  - The current plan card states its real terms: the price the household
    pays, the renewal date, "ends with this period" or "payment due". Before
    anything is paid it says "₹299 a month once payments open. Until then,
    nothing is charged."
  - A Monthly / "Yearly · save 20%" toggle is a link, so the choice lives in
    the URL.
  - Every plan shows its catalogue price, and a yearly price shows what it
    comes to per month and what it saves. Pro and Max carry "Free during
    early access".
  - The existing two-step `PlanForm` stays the only way to change plans; on a
    phone its action sits below the plan text.
  - A Billing row links to the history.
- **Checkout** (`/settings/plan/checkout`). This is our own summary before
  the provider's page:
  - the plan and its price, with the per-month arithmetic;
  - what the plan includes;
  - the household's region and currency;
  - the provider the router chose, and how that provider takes payment
    (Razorpay: UPI, cards, netbanking and wallets; Stripe: cards with 3-D
    Secure).

  Then comes "Continue to payment". When nothing can take the payment, it
  says so instead: "Pro is free during early access" or "Payments aren't open
  yet".
- **Payment result** (`/settings/plan/confirmed`, the provider's return URL).
  It shows one of three states: "You're on Pro", "Confirming your payment…"
  or "No payment was taken". While confirming, it re-reads the page every few
  seconds for about a minute. The plan changes only when the verified webhook
  says so.
- **Billing history** (`/settings/plan/billing`).
  - Shows the payment method from the last payment, as a closed word and at
    most the last four digits.
  - Lists every payment the ledger holds, with its status in closed words.
  - Before any payment, the empty state says nothing has been charged.
- **Invoice** (`/settings/plan/billing/[invoiceId]`). Shows the amount,
  status, plan, issue date, period covered, payment method and provider. It
  links to the provider's own invoice and receipt as the documents of record.
- **Cancel at the end of the period.**
  - An Admin confirms in two steps, and the provider is asked first.
  - Only when the provider accepts is `cancel_at_period_end` set and audited
    (`subscription.changed`, source `cancel_requested`).
  - Nothing is refunded or deleted.
  - The route is `POST /households/{id}/plan/cancel`, with an OpenAPI entry.
- **Landing.** The pricing section shows the same catalogue prices, with the
  yearly saving and "Free during early access". The e2e test now checks that
  every amount on it carries its period.
- `packages/core/src/billing/account.ts` holds the reads and arithmetic
  behind all of the above:
  - `priceLines`, `bestYearlySaving`, `formatPrice`;
  - `loadBillingTerms`, `listBillingHistory`, `loadInvoice`;
  - `paymentStatusWords`, `methodWords`;
  - `checkoutOption`, `cancelAtPeriodEnd`.

## Verified

- Billing unit tests: 122 passed. The new `account.test.ts` covers the
  catalogue arithmetic, early access, money in words and closed payment
  words.
- API, security and billing tests: 332 passed. The security gate covers
  12/12 areas.
- Database suites (payments, entitlements, tenant isolation): 42 passed. A
  fresh database carries exactly the four INR prices and no paid plan.
- The migration was applied live, and `npm run verify:live` passed 213/213,
  including a new check that the catalogue carries the decided INR prices.
- Browser QA at 360px and 1280px against the live project, with QA household
  "Mehta Pay QA Home":
  - the early-access plan screen, monthly and yearly;
  - a free switch to Pro, confirmed in the database;
  - an empty billing history;
  - a checkout with an unknown price, and a cancelled return;
  - then a seeded Razorpay-paid state: the renewal date, billing history,
    invoice detail, and cancel refused honestly with no live provider
    ("Nothing has changed");
  - the landing pricing section;
  - no horizontal overflow anywhere.

  One layout fix came out of it: on a phone, the plan rows' action moved
  below the plan text.
- The landing e2e tests (pricing, sections, readability) pass against the
  dev server.

## Still open / needs a person

- **Turning payments on.** For Razorpay (India):
  - create an account and set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
    `RAZORPAY_WEBHOOK_SECRET` and `WONDERHOME_BILLING_PROVIDERS=razorpay`;
  - create the four plans in Razorpay at these prices;
  - insert their ids into `payment_provider_plans`;
  - register `/api/v1/billing/webhook/razorpay`;
  - then mark Pro and Max `requires_payment`.

  From that moment checkout replaces "Free during early access".
- **Prices outside India.** Other currencies are not priced. Every household
  sees INR, which Razorpay takes from international cards.
- **20-011.** Payment notifications, staff monitoring and refunds, and
  reconciliation.

## Where the code lives

- `packages/core/src/billing/account.ts` (+ test)
- `apps/web/app/settings/plan/` (`page.tsx`, `checkout/`, `confirmed/`,
  `billing/`, `billing/[invoiceId]/`)
- `apps/web/app/_components/plan-form.tsx`, `checkout-button.tsx`,
  `cancel-plan-button.tsx`, `refresh-while-waiting.tsx`
- `apps/web/app/api/v1/households/[householdId]/plan/cancel/route.ts`
- `apps/web/app/_screens/landing.tsx` (pricing)
- `supabase/migrations/20261004090000_plan_prices_inr.sql`

## Cleanup

(Recorded after the merge.)
