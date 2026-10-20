# Paying household bills from inside WonderHome — trustworthy APIs

*Researched 2026-10-20/21 for the owner ("research on trustable apis to pay utility bills"). Facts carry their source; anything unverified or possibly stale is marked. Nothing here is built; no provider is live.*

## Summary
- **India: workable.** The right route is to become an NBBL-certified **Agent Institution** under an existing **Customer Operating Unit (COU)** on **Bharat Connect** (formerly BBPS), not a BBPOU ourselves.
- **Shortlist:** Razorpay, then Cashfree, then Setu.
- **Outside India:** no realistic consumer utility-pay API today.
  - US options are liability-focused (Method) or enterprise (Paymentus).
  - UK/EU open banking can pay any account but has no biller directory or bill fetch.
  - Stripe treats bill pay as a restricted business.
- **The biggest open question:** who collects the payer's money. The design must keep funds away from WonderHome. That needs a person's decision and each provider's written answer.

## 1. How Bharat Connect works
- **Name and rules.**
  - BBPS was renamed Bharat Connect in Aug 2024 ([NBBL circular](https://www.bharat-connect.com/strapi/uploads/Intimation_of_Rebranding_and_Change_in_Logo_of_BBPS_9362012970.pdf)).
  - It is governed by the *RBI (Bharat Bill Payment System) Directions, 2024*, in force 1 Apr 2024 ([RBI](https://www.rbi.org.in/scripts/BS_ViewMasDirections.aspx?id=12616)).
- **Roles under those Directions.**
  - **NBBL** runs the system.
  - **BBPOUs** act as **BOU** (they onboard billers) and/or **COU** (they serve customers).
  - An **Agent Institution** is "certified by NBBL, provides customer interface (physical / digital)". It is onboarded by a COU, which takes responsibility for it.
  - A **TSP** provides technology only; "no funds … flow through any TSP".
  - Non-bank BBPOUs are RBI-authorised Payment Aggregators with a BBPS-only escrow.
- **Payment and complaints.**
  - Payment modes: UPI, net banking, cards, cash, prepaid instruments.
  - NBBL runs one central complaint system, keyed on the BBPS reference.
- **Fetch flows.**
  - Each biller marks bill fetch as MANDATORY, OPTIONAL or NOT_SUPPORTED ([PayU](https://docs.payu.in/docs/bbps-integration-flow)).
  - Cashfree offers FETCH_AND_PAY, VALIDATE_AND_PAY and direct ([Cashfree](https://www.cashfree.com/docs/api-reference/other-apis/bbps-cou/overview)).
  - Every flow is asynchronous: a reference, then a poll or webhook.
- **Coverage.**
  - 22,400+ billers ([NBBL deck](https://www.bharat-connect.com/strapi/uploads/Bharat_Connect_Overview_Deck_for_website_29c4340e4a.pdf)).
  - Categories include electricity, water, gas, broadband, postpaid, DTH, insurance, loan EMI, education fees, municipal tax, FASTag and credit cards.
  - Third-party credit-card bill payments must route through BBPS since Jul 2024.
- **The payer** needs only an instrument and the biller's customer identifiers. Setu requires `remitter.name` ([Setu](https://docs.setu.co/payments/billpay/api-integration/paying-bills)). The **agent ID belongs to the Agent Institution**.
  - *Unverified:* whether a COU requires payer KYC above a threshold.
- **RBI rules.**
  - The *Payment Aggregator Directions, 2025* (15 Sep 2025) replaced the 2020 PA/PG guidelines ([RBI](https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12896)).
  - Whoever **collects** the payer's money must be a PA or a bank.
  - Some COU APIs (Setu's pay with debit info; Cashfree's wallet ledger) suggest prefunded or self-collecting agent models. *Unverified per provider.*
  - **Safe design:** the payer pays through the COU's own checkout or UPI intent. WonderHome never holds money.
- **What WonderHome would carry as an Agent Institution:**
  - NBBL certification of its interface;
  - the COU's contract;
  - front-end grievance handling with the complaint API;
  - accurate display of the amount and convenience fee;
  - data protection for biller identifiers.

## 2. Providers

| Provider | Offers | Credibility | Sandbox / status / complaints | Pricing |
|---|---|---|---|---|
| **Razorpay** | Licensed COU: categories, billers, fetch, pay ([docs](https://razorpay.com/docs/pos/billme/bbps.md)) | Final RBI PA authorisation, Dec 2023 ([Moneylife](https://www.moneylife.in/article/razorpay-cashfree-get-final-approval-from-rbi-to-function-as-payment-aggregators/72912.html)) | Test keys; status by polling. Webhooks and complaints not documented publicly | Not public |
| **Cashfree** | COU **and** BOU: discovery with fees, fetch, pay, complaint tickets, wallet ledger ([docs](https://www.cashfree.com/docs/api-reference/other-apis/bbps-cou/overview)) | Final PA authorisation, Dec 2023 | Sandbox, test data, webhooks; 100 requests/min | Not public |
| **Setu (Pine Labs)** | COU infrastructure: fetch, pay, dispute, webhooks ([docs](https://docs.setu.co/payments/billpay/api-integration/paying-bills)) | Pine Labs owned since 2022; says it is an NBBL TSP. *Its PA status and sponsoring COU are unverified* | Playground, webhooks, dispute API | Not public |
| **PayU** | BBPOU; agents onboarded with OAuth ([docs](https://docs.payu.in/docs/bbps-integration-flow)) | Final online PA approval, May 2025 | Test server and agent | Not public |
| **BillAvenue (Infibeam)** | BBPOU for Agent Institutions | Perpetual BBPOU licence, Dec 2022 | Docs not public; also sells "recharge APIs" | Not public |
| **Banks** (Axis, Kotak, RBL, ICICI) | COU APIs, mostly NDA-gated ([Kotak](https://www.kotak.bank.in/en/open-banking/bbps-apis.html)) | BBPOUs by right | Sandboxes behind NDA | Negotiated |
| Juspay, Eko, Decentro, PaySprint, Instantpay | *Could not verify a certified BBPS COU product from primary sources* | — | — | — |

## 3. UPI
- **UPI AutoPay** is a Bharat Connect payment mode since Feb 2024 ([NBBL](https://bharat-connect.com/pdfs/circulars/2024/Introduction_of_payment_mode_UPI_AutoPay_for_BBPS_payments.pdf)).
  - E-mandates up to ₹15,000 need no extra authentication.
  - The 2026 directions require a pre-debit notice 24 h ahead.
  - **Product fit:** it conflicts with "paying always waits for a tap". It could only ever be a later, explicit per-bill Admin opt-in.
- **Paying a biller's own UPI ID** has no fetch, no BBPS reference and no complaint route. Not recommended.
- **Tap to pay fits well:** Bharat Connect fetch → show biller, amount, fee and due date → person taps Pay → **UPI intent** and PIN (the person's own confirmation) → webhook → receipt with the BBPS reference.

## 4. Outside India
- **US**
  - **Method Financial** handles loans and credit cards from a linked bank account ([docs](https://docs.methodfi.com/reference/payments/overview)); generally not utilities.
  - **Paymentus IPN** is an enterprise partnership.
  - **Arcus** went to Mastercard and refocused on LatAm; treat it as unavailable.
  - **Doxo is a red flag:** the FTC sued it in 2024 over biller impersonation and junk fees ([FTC](https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-takes-action-against-bill-payment-company-doxo-misleading-consumers-tacking-millions-junk-fees)).
  - **Plaid** only links accounts.
  - **Stripe** restricts bill pay ([FAQ](https://support.stripe.com/questions/prohibited-and-restricted-business-list-faqs)).
- **UK/EU:** TrueLayer and Yapily (FCA-authorised) can make a one-off bank payment to any payee, and GoCardless runs direct debit (1% + 20p, capped at £4). None has a biller directory or bill fetch, and most households already pay by Direct Debit.
- **Realistic now:** a "Pay on the biller's site" link.

## 5. Recommendation
- **India shortlist:**
  1. **Razorpay BBPS COU**, since WonderHome already uses Razorpay. Confirm webhooks, the complaint API and the fund flow.
  2. **Cashfree COU**, the most complete public API.
  3. **Setu**, once its regulated entity and sponsoring COU are confirmed.
- **Elsewhere:** no money movement for now, just a link to the biller. Later, Method (US loans and cards) or TrueLayer (UK) if demand appears.
- **Needs a person:**
  - signing a COU agreement and getting NBBL Agent Institution certification;
  - the fund flow (no WonderHome-held wallet, ever);
  - liability and the complaint front end;
  - the customer convenience fee, which must be shown before the tap;
  - payer KYC (the default: adults and Admins only);
  - PCI scope (hosted checkout and UPI intent only);
  - DPDP terms.
- **Buildable now, provider-neutral**, in the style of `billing/provider.ts`:
  - **A `BillPaymentProvider` port:** categories, billers (platform data, cached per server), `fetchBill`, `validate`, `createPayment` (idempotent on our intent id), `paymentStatus`, `raiseComplaint`, `complaintStatus`, `verifyWebhook`.
  - **A deterministic mock** that returns success, failure, a stuck pending and duplicate webhooks.
  - **Money in major units**, converted only in the adapter.
  - **A forward-only ledger:** `fetched → awaiting_tap → submitted → processing → succeeded | failed | reversed`, with the BBPS reference. Success marks the bill paid through the bills service.
  - **Consent:**
    - pay is `app_only` for voice and never autonomous;
    - HomeTalk may only open the confirm screen;
    - the approval fingerprint covers biller, amount and fee.
  - **Inert until** `WONDERHOME_BILLPAY_PROVIDER` and keys are set.
  - **A notice per failed or stuck payment**, and a complaint screen keyed on the BBPS reference.
- **Red flags:**
  - prefunded wallets holding user money;
  - unlicensed "recharge API" resellers;
  - off-network UPI to a biller's own ID;
  - a TSP that moves money;
  - Doxo-style biller impersonation and hidden fees;
  - autopay on by default.

## Unverified / possibly stale
- Every provider's pricing and fund flow.
- Setu's licence and sponsoring COU.
- The BBPS products of Juspay, Eko, Decentro, PaySprint and Instantpay.
- The BBPOU net-worth figure.
- 2025 volumes.
- The ₹1 lakh e-mandate categories.
- Arcus's current status.
- Doxo's 2026 settlement.
