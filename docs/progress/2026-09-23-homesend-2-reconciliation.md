# HomeSend 2.0, part 2: who it's for, what's already on record, and email 2.0 — Wave 3 (story 14-011)

**Status:** part 2 of 3 shipped. Story 14-011 stays In Progress until part 3
(confirmation strategy §12, HomeSend metrics §19, the §20 acceptance matrix)
lands.

## What was done, and why

Part 1 gave every input one pipeline and one reading (`IntakeUnderstanding`).
Part 2 is what happens between that reading and a write: who the item is for,
whether it is already on record, and what else it asks for — so HomeSend
updates the Science Exhibition that moved instead of adding a second one.

- **Entity resolution (§9)** — `packages/core/src/homesend/resolve.ts`.
  Names the content used are resolved through the same Wave 1 resolver
  HomeBrain uses (`context/resolution.ts`), never by the model. A school item
  can only be for a child, a health document never for a helper. One clear
  match is selected; two give one question — "Who is this for — Asmi or
  Manan?" — and the review's picker starts on "Choose who this is for", a
  required field, so nothing is filed for a guessed child. No name and one
  child is that child (not a guess); no name and two children is the
  question.
- **Reconciliation (§10)** — `homesend/reconcile.ts`. Every candidate is
  matched against the household's records through Wave 1's
  `findPotentialMatches`, and the match becomes one proposal: *duplicate*,
  *update* (date and/or amount, each change listed), *cancellation*, or
  *conflict*. The message is the spec's own: "I found Asmi's existing Science
  Exhibition for 28 Sep. This message says it moved to 29 Sep. Update the
  existing event?" — the record's own kind ("exam", "homework") in the
  question. A cancelled record is never proposed for cancellation again, and
  the other child's similar record is never touched. A moved date keeps the
  time of day it had in the household's own zone (`movedDueAt`).
- **Updates and cancellations with exact undo** — migration
  `20260924100000_homesend_reconciliation_changes.sql` gives
  `homesend_changes` a `change_type` (`created` / `updated` / `cancelled`)
  and `previous` (what the change replaced; required exactly when it is not a
  creation). Updates go through `updateSchoolItem`/`updateObligation`,
  cancellations through `cancelSchoolItem`/`cancelObligation`, and undo puts
  back exactly `previous` — via the new `restoreSchoolItem`/`restoreObligation`
  for a cancellation. Never a raw write, never a hard delete.
- **Multi-domain impact (§11)** — one notice can ask for a white T-shirt *and*
  sports shoes. The uniqueness rule became one change per *record* per intake
  (`homesend_changes_one_per_intake_record`), each need is its own checkbox in
  the review, its own consumable, its own change row and its own Undo — named
  in the inbox ("Also added to Groceries: Sports shoes") so two can be told
  apart.
- **Review UI (§13)** — `home-send-intake.tsx`: "What I found" (summary,
  source, confidence), "I found 3 things: Annual Day rehearsal, White T-shirt,
  Sports shoes.", the reconciliation headline, and one path per job: *Update
  existing* / *Cancel existing* (primary), *Keep existing*, *Add as new*; a
  duplicate or conflict offers *Keep existing* / *Add anyway*. Items already
  waiting in the inbox are prepared server-side on load
  (`apps/web/app/(auth)/home-send-review.ts`), so reopening one shows the same
  question a fresh send would. The inbox's history says "Updated the one on
  record" / "Cancelled the one on record".
- **Email 2.0 (§7)** — `homesend/email-gateway.ts` and the webhook. The
  received email's `to`/`cc`/`created_at`/`attachments` are parsed into an
  `EmailSource`; every recipient address is resolved, so a forward to two
  households' addresses reaches both; the body is read from text or, failing
  that, HTML. Up to five attachments are fetched through Resend's attachment
  API (`fetchReceivedAttachment`: only `https://*.resend.com` download links,
  size-capped) and each becomes its own `email_attachment` item under the
  email (`ingestEmailAttachment`), through the same secure intake — so a
  malicious attachment fails safely on its own without losing the email text.
  Idempotent by `external_id` (`<email id>:<attachment id>`); an attachment
  Resend could not serve yet returns 502 so Resend retries, and the retry
  does not duplicate what already landed.

## Verification

- Unit: `npm run test` — 1,940 core/web tests + 43 script tests, all green
  (reconcile/resolution 16, email gateway 21, ingest incl. 4 attachment
  tests; the SQL-concatenation guard in `security/injection.test.ts` caught a
  message template that read like SQL and it was restructured).
- DB: `node --test scripts/test-homesend-rls.mjs` — 57/57, including: an
  existing change reads as `created` with nothing replaced; an update or
  cancellation must say what it replaced and a creation must not; an unknown
  change type is refused; the same record twice per intake is refused; two
  different needs from one notice are allowed and undone independently.
- Typecheck and every lint (`lint`, `lint:migrations`, `lint:embeds`,
  `lint:boundaries`, `lint:secrets`) clean.
- **Migration applied live** via Supabase MCP `apply_migration`;
  `npm run verify:live` 125/125 with `homesend_changes.change_type` and
  `.previous` added to `SHIPPED_COLUMNS`.
- **Browser, 360px and 1280px, no horizontal overflow**, against a QA
  household with two children, an existing Science Exhibition (Asmi, 28 Sep
  10:00 IST), Sports Day (Manan, 3 Oct) and an electricity bill (1,240.50,
  5 Oct). The sandbox has no AI key, so the classifier's reading was seeded
  as rows the model would have produced; everything after that ran for real:
  - Update existing → the exhibition moved to 29 Sep and stayed 10:00 IST
    (first run found it dropping the time — fixed with `movedDueAt`); Undo →
    back to exactly 28 Sep 04:30Z.
  - Cancel existing on Sports Day → cancelled; Undo → pending again.
  - Annual Day notice with no name → "Who is this for — Asmi or Manan?";
    submitting without a choice is blocked; choosing Manan with both needs
    ticked wrote the school item and two consumables; undoing only the
    T-shirt retired it and left the shoes and the school item in place.
    (First run showed blank need names — the seed used the wrong shape; the
    component now also skips a need with no title.)
  - Bill: Keep existing → item dismissed, bill untouched; Update existing →
    12 Oct, 1,310.00; Undo → 5 Oct, 1,240.50.
- Not browser-testable here: real email and attachments (no Resend
  credentials — covered by the contract and ingest tests above, and still
  never labelled connected, §18); a real model reading.

## Test data

QA account `77291a4f-c1ec-4130-babf-3bec3b019d2f`, household "Mehta QA Home"
`55652b61-5a7b-4fb3-a271-574e81ee4ebb`, and every row seeded in it — removed
after the merge per CLAUDE.md; the PR's cleanup is recorded below once done.

## Still open

- Part 3: confirmation strategy (§12 — auto-apply only where a domain and the
  household's policy allow it; consequential changes through existing
  governance), HomeSend metrics (§19), the §20 acceptance matrix, and marking
  14-011 Done.
- Health documents and grocery items are matched as duplicates but not
  offered update/cancel — only bills and school items have a revisable shape.

## Where the code lives

`packages/core/src/homesend/{resolve,reconcile,changes,ingest,email-gateway,repository}.ts`,
`packages/core/src/{school,finance,commerce}/repository.ts`,
`apps/web/app/(auth)/{home-send-actions,home-send-review}.ts`,
`apps/web/app/_components/{home-send-intake,home-send-inbox,home-send-sheet}.tsx`,
`apps/web/app/home-send/page.tsx`,
`apps/web/app/api/v1/homesend/email/webhook/route.ts`,
`supabase/migrations/20260924100000_homesend_reconciliation_changes.sql`,
`scripts/test-homesend-rls.mjs`.
