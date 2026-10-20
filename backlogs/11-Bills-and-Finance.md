# WonderHome — Bills, Fees & Finance

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 11-001 | Obligation model | Done | an obligation may exist before its amount does, which is the normal case |
| 2 | P0 | 11-002 | Bill ingestion | Done | provider identity makes a re-import reconcile rather than duplicate |
| 3 | P0 | 11-003 | Due-date risk | Done | lead time by consequence, and silence once a payment is arranged |
| 4 | P0 | 11-004 | Approval | Done | approval is for one exact amount; a changed figure invalidates it |
| 5 | P0 | 11-005 | Payment safety | Done | step-up is separate from being signed in; one success per intent, enforced by index |
| 6 | P1 | 11-006 | Anomaly detection | Done | an anomaly carries its comparison and is a review, never a block |
| 7 | P1 | 11-007 | Budget planning | Done | a budget describes intent; it never stops the rent being paid. Since 2026-09-25 an Admin sets, changes and removes (retires) a budget per kind of bill on Bills & Finance; what it has used is the period's payments in its own currency (`finance/budgets.ts`) — before that the screen read a column that does not exist and always showed the empty state |
| 8 | P2 | 11-008 | Autonomous recurring payments | Done | policy and idempotency in place; no payment provider is live |
| 9 | P1 | 11-009 | Bills & Finance's three counts side by side | Done | The owner, 2026-10-20: Need you, Upcoming and Settled sit three across as `ExpandableMetricRow`, the same as Kids & School (08-014), with the open tile's bills in one full-width panel below. CLAUDE.md rule 19 names it as the second written exception. Checked at 360px and 1280px, no sideways scroll |
| 10 | P0 | 11-010 | Bills picked not typed, payees by home location, earlier bills, months made ahead, and HomeTalk/HomeBrain in control | Done | The owner, 2026-10-20. **Picked:** Add a bill starts from 22 typical bills (`finance/bill-catalog.ts`: electricity, water, piped gas, LPG, rent, maintenance, mobile, broadband, DTH, streaming, newspaper, gym, school fees, tuition, home/car/personal loan EMI, credit card, life/health/vehicle insurance, property tax) or Something else; picking fills kind and how often, and `obligations.bill_type` keeps it. Who in the family pays it is a picker; recurrence is editable. **Payees by location:** `finance/payees.ts` reads the state and city from the address saved under Manage Household (by name, never coordinates) and offers that city's and state's companies first (discoms, water boards, city gas, municipal corporations), then national ones (telecom, broadband, DTH, streaming, banks, cards, insurers); Add a new payee stays. **Earlier bills:** rows on the add form, each a history row. **Made ahead:** `finance/periods.ts` works out this month and the next three (one for quarterly/yearly) from the due date; each says paid, the amount given, or Usually and the last paid, never a guess; the pencil fills one in (`fillBillPeriodAction`): an amount (`obligation_periods`, migration `20261020170000`, live) or a paid day (current month moves the bill on; a later month is paid ahead and skipped, `nextOpenDueDate`); the monthly spend stops at this month. **HomeTalk:** `add_bill` (asked once), `record_bill_payment` and `set_bill_amount` (done at once, undoable, the consumed advance amount restored) in `conversation/bill-talk.ts`, grounded to the household's own bills (`matchBill`; two that fit are one question), financial reply class, capability `bill_records` (in-app voice, never Alexa), golden HT-129–131 and the §21 table. **HomeBrain:** paid months and coming months are facts (`bill_payment`, `bill_period`). No money moves; paying stays `make_payment`. Help ¶7–9 in all eight languages. |
| 11 | P2 | 11-011 | Payees beyond the catalogue's cities, and outside India | Not Started | Left open by 11-010: the payee list covers each state's electricity company and the larger cities' water, gas and property tax; smaller cities and other countries show the national list and Add a new payee. Grow the list by city, and add per-country lists once a household outside India asks. |
| 12 | P0 | 11-012 | Month by month, budgets per line item, and a bill form that asks once | Done | The owner, 2026-10-20, from phone screenshots. A recurring bill shows Month by month: its last three months (Paid from the history, or Not entered with the pencil to say what it came to and when it was paid), this month and one ahead (`billPeriods` with `PERIODS_BEHIND`, `previousDueDate`). Budgets are per line item — electricity, water, piped gas, cooking gas, petrol and diesel (new `fuel` bill type), rent… — picked from a list grouped by kind like the bill picker, and count the payments of bills of that type (`budgetSpend` by `billType`); a budget set earlier for a whole kind keeps counting it. Add a bill asks for the amount and the due date once, under This bill; the Earlier bills rows are gone (the months are filled in on the bill). Saving a bill with no amount no longer fails: a currency is kept only with an amount (`obligations_amount_has_currency`). An unexpected error now carries a real reference in its message and the server log (`toErrorBody`). |
| 13 | P1 | 11-013 | Monthly spend as line charts, all bills and each bill | Done | The owner, 2026-10-20 ("show line graph for each type, show data points on x and y axis, decide best way to plot it"). The bar strip became `bills/spend-lines.tsx`: the household's total first, then one small chart per bill (small multiples, two up from `sm`, one per row on a phone), all on the same six calendar months ending at the newest on record. Each chart is one series (title, no legend); y axis is money from zero with three nice ticks; x axis the months (with the year when they span two); a dot per month on record, a month with nothing breaks the line (never interpolated); the newest amount labelled; tap, hover or focus a dot for its amount; Show as table gives the same numbers. Domain tone `--wh-tone-money`, 2 px line, dots with a surface ring, recessive grid. Words in all eight languages, help ¶1. Checked at 360px and 1280px, no overflow. |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Bills, Fees & Finance as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 11-E01 — Bills, Due Dates & Safe Payments:** stories 11-001 through 11-005.
- **Epic 11-E06 — Financial Intelligence:** stories 11-006 through 11-007.
- **Epic 11-E08 — Controlled Payment Automation:** stories 11-008 through 11-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 11-001 — Obligation model
**Epic:** Bills, Due Dates & Safe Payments
**Priority:** P0
**Goal:** Represent utilities, classes, subscriptions and fees.

**Acceptance criteria**
- Given the household state described by the story, represent utilities, classes, subscriptions and fees .
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 11-002 — Bill ingestion
**Epic:** Bills, Due Dates & Safe Payments
**Priority:** P0
**Goal:** Import configured bills and detect duplicates.

**Acceptance criteria**
- Given the household state described by the story, import configured bills and detect duplicates .
- A payment retry cannot create a second provider transaction for the same approved intent.
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 11-003 — Due-date risk
**Epic:** Bills, Due Dates & Safe Payments
**Priority:** P0
**Goal:** Notify responsible member only when action is needed.

**Acceptance criteria**
- Given the household state described by the story, notify responsible member only when action is needed .
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 11-004 — Approval
**Epic:** Bills, Due Dates & Safe Payments
**Priority:** P0
**Goal:** Prepare payments and enforce policy.

**Acceptance criteria**
- Given the household state described by the story, prepare payments and enforce policy .
- Policy evaluation returns a deterministic allow/deny/approval result that can be consumed by APIs and AI tools.
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 11-005 — Payment safety
**Epic:** Bills, Due Dates & Safe Payments
**Priority:** P0
**Goal:** Use step-up authentication for sensitive payment actions.

**Acceptance criteria**
- Given the household state described by the story, use step-up authentication for sensitive payment actions .
- A payment retry cannot create a second provider transaction for the same approved intent.
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 11-006 — Anomaly detection
**Epic:** Financial Intelligence
**Priority:** P1
**Goal:** Detect unusual amounts.

**Acceptance criteria**
- Given the household state described by the story, detect unusual amounts .
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 11-007 — Budget planning
**Epic:** Financial Intelligence
**Priority:** P1
**Goal:** Support authorized household financial planning.

**Acceptance criteria**
- Given the household state described by the story, support authorized household financial planning .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 11-008 — Autonomous recurring payments
**Epic:** Controlled Payment Automation
**Priority:** P2
**Goal:** Support only policy-approved low-risk payments.

**Acceptance criteria**
- Given the household state described by the story, support only policy-approved low-risk payments .
- Policy evaluation returns a deterministic allow/deny/approval result that can be consumed by APIs and AI tools.
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.