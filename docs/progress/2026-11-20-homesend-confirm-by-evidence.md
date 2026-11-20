# HomeSend confirms by evidence and action (2026-11-20 review, part 2)

The owner asked for HomeSend to be "as autonomous as possible, with minimum inputs" and then to "implement all the suggested features" of the review *HomeSend on Its Own*. This is part 2 of four parallel builds: **confirm by evidence and action, not by taps**. Parts 1 (history fill), 3 (daily summary, quieter questions) and the health-records Admin setting are other sessions.

## What changed

1. **Payment proof (decision 2).** `homesend/payment-proof.ts` reads a bank, card or UPI message (pasted, shared, WhatsApp, forwarded email, screenshot) deterministically: amount, currency, payee, day, method. It is never proof when it asks for anything (pay now, approve, collect request, click, PIN/OTP, "will be debited", "is due"), when money came in, or when the content tried to instruct WonderHome; links are never followed. `ingest.ts` keeps it as a receipt-kind item with `understanding.payment`. `homesend/payment-apply.ts` (run by the deadlines pass, requested at once from `home-send-auto.ts`) marks the one bill matching by payee, a date window and an agreeing amount paid through `markObligationPaid`, as a Checking HomeSend change whose Undo runs `undoBillPayment`, and confirms the bill's own Checking entry (`payment_proof`). No match, or a disagreeing amount: recorded on its own as a paid one-off ("Paid to …", Checking, Undo). A disagreeing amount never marks the bill paid; the nightly check asks its "unusual amount" question. WonderHome never pays.
2. **More ways to confirm.** `confirmed_basis` gains `payment_proof`, `receipt` (a matching receipt from the payee, nightly), `marked_paid` (Bills' Mark paid, a reminder's Mark paid, HomeTalk's "paid") and `due_passed` (its day passed with no correction and no conflict; never health). Safe before the migration: a refused basis confirms with the basis left blank.
3. **"Update the existing bill?" applies at once** for one clear bill (`update_now`, source `matched_at_once`, Checking, Undo). Asked only when two bills could match (`reconcile.ts` `ambiguous`). A cancellation still never cancels.
4. **Several bills in one document** are added at once (`add_now`) where money is recorded directly; "Wait for review" still asks.
5. **Unreadable items** get a stronger second read before being set aside: OCR first for photos and PDFs (`ai/read-words.ts`), then the provider's strongest model (`SECOND_READ_MODEL`, `classifyIntake(..., { stronger: true })`), all through `ai/provider-clients.ts`. "Send it again" is asked only of a sender who spoke in HomeTalk in the last 10 minutes; otherwise set aside `unreadable`.

## Verified

- Unit tests: `homesend/` + `hometalk/` + `homebrain/` + `evaluation/` + `help/` + the touched web actions' tests, all green (new: `payment-proof.test.ts` 13, deadlines 3 cases, verify-night 5, needs-you-run 2 end-to-end on the in-memory database). The in-memory test database gained `upsert` and copy-on-read.
- Evaluation: `npm run eval -- --cases HS-60,HS-90,HS-111..HS-119` 11/11; NY-07 updated. HS-114–116 are the unsafe cases (a "payment" that asks to pay, to approve a collect request with a PIN, or carries instructions) and stay refused.
- Typecheck (core, web) and ESLint on the changed app files clean.

## Needs a person

- Migration `supabase/migrations/20261120120000_homesend_confirmed_by_evidence.sql` (widens the `confirmed_basis` check). The Supabase MCP refuses these sessions, so the SQL went to the coordinator; safe in either order.
- Help: a new "home-send" paragraph (body 17) in all eight languages. Paragraphs 5 and 9 still describe asking to resend and "Update the existing bill?" as before; part 3's rewrite of the questions owns those paragraphs.

## Where

`packages/core/src/homesend/{payment-proof,payment-apply,deadlines,matched-update,reconcile,ingest,retry-queue,changes}.ts`, `homebrain/verify-night{,-run}.ts`, `hometalk/needs-you-run.ts`, `ai/{read-words,classify-intake,model-client}.ts`, `apps/web/app/_lib/homesend-settle.ts`, `apps/web/app/(auth)/{home-send-auto,home-send-actions,finance-actions,notification-actions}.ts`.

Test data: none created on the live project.
